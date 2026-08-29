import { randomUUID } from 'node:crypto';
import type { Document, Skill } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound } from '../lib/errors.js';
import { readEncrypted, removePath, writeEncrypted } from '../lib/storage.js';
import { chunkText, parseDocument, typeLabel } from '../lib/parsers.js';
import { embed, embeddingsAvailable, toVectorLiteral } from '../engine/embeddings.js';
import { normalizeArabic } from './memory.service.js';

/**
 * قاعدة المعرفة: المهارات النصية + الملفات المرفوعة.
 *
 * الاسترجاع هجين — تشابه دلالي (pgvector) + مطابقة كلمات مفتاحية.
 * لو التضمين مو متاح، الكلمات المفتاحية لحالها تكفي والنظام يظل شغّال.
 */

/** أقصى عدد مقاطع نحقنها في برومبت النظام. */
export const RETRIEVE_LIMIT = 6;

// ───────────────────────── المهارات ─────────────────────────

export interface SkillInput {
  title: string;
  description?: string;
  content: string;
  tags?: string[];
  enabled?: boolean;
  alwaysOn?: boolean;
}

export async function listSkills(): Promise<Skill[]> {
  return prisma.skill.findMany({
    orderBy: [{ alwaysOn: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function createSkill(input: SkillInput): Promise<Skill> {
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) throw badRequest('اكتب اسم المهارة');
  if (!content) throw badRequest('اكتب محتوى المهارة');

  const skill = await prisma.skill.create({
    data: {
      title,
      description: input.description?.trim() ?? '',
      content,
      tags: input.tags ?? [],
      enabled: input.enabled ?? true,
      alwaysOn: input.alwaysOn ?? false,
    },
  });

  await indexSkill(skill);
  return skill;
}

export async function updateSkill(id: string, input: Partial<SkillInput>): Promise<Skill> {
  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) throw notFound('ما لقينا هذي المهارة');

  const title = input.title?.trim();
  const content = input.content?.trim();
  if (title !== undefined && !title) throw badRequest('اسم المهارة ما ينفع يكون فاضي');
  if (content !== undefined && !content) throw badRequest('محتوى المهارة ما ينفع يكون فاضي');

  const skill = await prisma.skill.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.alwaysOn !== undefined ? { alwaysOn: input.alwaysOn } : {}),
    },
  });

  // نعيد الفهرسة إذا تغيّر المحتوى
  if (content !== undefined || title !== undefined) {
    await prisma.chunk.deleteMany({ where: { skillId: id } });
    await indexSkill(skill);
  }

  return skill;
}

export async function deleteSkill(id: string): Promise<void> {
  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) throw notFound('ما لقينا هذي المهارة');
  await prisma.skill.delete({ where: { id } });
}

async function indexSkill(skill: Skill): Promise<void> {
  const chunks = chunkText(`${skill.title}\n\n${skill.content}`);
  await storeChunks(chunks, { skillId: skill.id });
}

// ───────────────────────── الملفات ─────────────────────────

export interface UploadInput {
  filename: string;
  mime: string;
  buffer: Buffer;
}

/** الملف كما يُعرض — بدون مسار التخزين الداخلي. */
export type PublicDocument = Omit<Document, 'path'> & { chunkCount?: number };

/** يشيل مسار التخزين قبل ما يطلع الملف من السيرفر. */
export function toPublicDocument(document: Document): PublicDocument {
  const { path: _path, ...rest } = document;
  return rest;
}

export async function listDocuments(): Promise<
  (Omit<Document, 'path'> & { chunkCount: number })[]
> {
  const rows = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } },
  });

  return rows.map(({ path: _path, _count, ...rest }) => ({
    ...rest,
    chunkCount: _count.chunks,
  }));
}

/**
 * يرفع ملفًا: يحفظه مشفّرًا، يستخرج نصه، ويفهرسه للاسترجاع.
 * الفهرسة تصير في الخلفية عشان الرفع يرجع بسرعة.
 */
export async function uploadDocument(input: UploadInput): Promise<PublicDocument> {
  const relPath = `uploads/${randomUUID()}`;
  await writeEncrypted(relPath, input.buffer);

  const document = await prisma.document.create({
    data: {
      filename: input.filename,
      mime: input.mime,
      size: input.buffer.length,
      path: relPath,
      status: 'pending',
    },
  });

  void processDocument(document.id).catch((error: unknown) => {
    logger.error(`فشل معالجة الملف ${document.filename}`, error);
  });

  return toPublicDocument(document);
}

/** يقرأ الملف، يستخرج نصه، ويفهرسه. */
export async function processDocument(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return;

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'processing', error: null },
  });

  try {
    const buffer = await readEncrypted(document.path);
    const parsed = await parseDocument(buffer, document.mime);

    if (!parsed.text) {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'ready',
          textLength: 0,
          preview: null,
          ...(parsed.pageCount !== undefined ? { pageCount: parsed.pageCount } : {}),
          error: 'ما لقينا نص في هذا الملف',
        },
      });
      return;
    }

    await prisma.chunk.deleteMany({ where: { documentId } });
    const chunks = chunkText(parsed.text);
    await storeChunks(chunks, { documentId, filename: document.filename });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'ready',
        textLength: parsed.text.length,
        preview: parsed.text.slice(0, 500),
        ...(parsed.pageCount !== undefined ? { pageCount: parsed.pageCount } : {}),
        error: null,
      },
    });

    logger.info(
      `فهرسنا ${typeLabel(document.mime)}: ${document.filename} — ${chunks.length} مقطع`,
    );
  } catch (error) {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'خطأ غير معروف',
      },
    });
    throw error;
  }
}

export async function deleteDocument(id: string): Promise<void> {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw notFound('ما لقينا هذا الملف');

  await removePath(document.path).catch(() => undefined);
  await prisma.document.delete({ where: { id } });
}

/** يرجّع محتوى الملف الأصلي للتحميل. */
export async function readDocument(id: string): Promise<{ document: Document; buffer: Buffer }> {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw notFound('ما لقينا هذا الملف');
  return { document, buffer: await readEncrypted(document.path) };
}

// ───────────────────────── الفهرسة ─────────────────────────

interface ChunkOwner {
  documentId?: string;
  skillId?: string;
  filename?: string;
}

/** يخزّن المقاطع مع متجهاتها. المتجه اختياري — بدونه يشتغل البحث بالكلمات. */
async function storeChunks(
  chunks: { content: string; ordinal: number }[],
  owner: ChunkOwner,
): Promise<void> {
  if (chunks.length === 0) return;

  const canEmbed = await embeddingsAvailable();

  for (const chunk of chunks) {
    const created = await prisma.chunk.create({
      data: {
        ...(owner.documentId ? { documentId: owner.documentId } : {}),
        ...(owner.skillId ? { skillId: owner.skillId } : {}),
        ordinal: chunk.ordinal,
        content: chunk.content,
        tokens: Math.ceil(chunk.content.length / 3),
        ...(owner.filename ? { meta: { filename: owner.filename } } : {}),
      },
    });

    if (!canEmbed) continue;

    // فشل التضمين ما يفشّل الفهرسة — المقطع محفوظ ويظل قابلًا
    // للبحث بالكلمات المفتاحية
    try {
      const vector = await embed(chunk.content);
      if (!vector) continue;

      await prisma.$executeRawUnsafe(
        'UPDATE chunks SET embedding = $1::vector, dim = $2 WHERE id = $3',
        toVectorLiteral(vector),
        vector.length,
        created.id,
      );
    } catch (error) {
      if (!warnedEmbedFailure) {
        warnedEmbedFailure = true;
        logger.warn(
          'تعذّر حفظ متجه التضمين — الاسترجاع بيعتمد على الكلمات المفتاحية',
          error,
        );
      }
    }
  }
}

/** نحذّر مرة وحدة بس، لا نغرق السجل بنفس الخطأ لكل مقطع. */
let warnedEmbedFailure = false;

/** يعيد فهرسة كل شيء — بعد تبديل نموذج التضمين مثلًا. */
export async function reindexAll(): Promise<{ skills: number; documents: number }> {
  const [skills, documents] = await Promise.all([
    prisma.skill.findMany(),
    prisma.document.findMany({ where: { status: 'ready' } }),
  ]);

  await prisma.chunk.deleteMany({});

  for (const skill of skills) await indexSkill(skill);
  for (const document of documents) await processDocument(document.id);

  logger.info(`أعدنا فهرسة ${skills.length} مهارة و${documents.length} ملف`);
  return { skills: skills.length, documents: documents.length };
}

// ───────────────────────── الاسترجاع ─────────────────────────

export interface RetrievedChunk {
  id: string;
  content: string;
  source: string;
  score: number;
  kind: 'skill' | 'document';
}

interface RawRow {
  id: string;
  content: string;
  skill_title: string | null;
  doc_filename: string | null;
  distance: number | null;
}

/**
 * بحث دلالي بـ pgvector.
 * نقيّد على المقاطع اللي أبعادها تطابق النموذج الحالي، عشان ما نقارن
 * متجهات فُهرست بنموذج مختلف.
 */
async function semanticSearch(query: string, limit: number): Promise<RetrievedChunk[]> {
  const vector = await embed(query);
  if (!vector) return [];

  let rows: RawRow[];
  try {
    rows = await prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT c.id,
            c.content,
            s.title    AS skill_title,
            d.filename AS doc_filename,
            (c.embedding <=> $1::vector) AS distance
       FROM chunks c
       LEFT JOIN skills    s ON s.id = c."skillId"
       LEFT JOIN documents d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
        AND c.dim = $2
        AND (s.id IS NULL OR s.enabled = true)
      ORDER BY distance ASC
      LIMIT $3`,
      toVectorLiteral(vector),
      vector.length,
      limit,
    );
  } catch (error) {
    // البحث الدلالي فشل — نرجع فاضي والبحث بالكلمات يغطي
    logger.debug('فشل البحث الدلالي', error);
    return [];
  }

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    source: row.skill_title ?? row.doc_filename ?? 'معرفة',
    // المسافة 0 = تطابق تام، 2 = عكس تام
    score: 1 - (row.distance ?? 1) / 2,
    kind: row.skill_title ? ('skill' as const) : ('document' as const),
  }));
}

/** بحث بالكلمات المفتاحية — الشبكة الاحتياطية لما التضمين مو متاح. */
async function keywordSearch(query: string, limit: number): Promise<RetrievedChunk[]> {
  const words = normalizeArabic(query)
    .split(' ')
    .filter((word) => word.length > 2)
    .slice(0, 12);

  if (words.length === 0) return [];

  const rows = await prisma.chunk.findMany({
    where: {
      OR: words.map((word) => ({ content: { contains: word, mode: 'insensitive' as const } })),
      skill: { is: null },
    },
    include: { document: { select: { filename: true } } },
    take: limit * 4,
  });

  const skillRows = await prisma.chunk.findMany({
    where: {
      OR: words.map((word) => ({ content: { contains: word, mode: 'insensitive' as const } })),
      skill: { enabled: true },
    },
    include: { skill: { select: { title: true } } },
    take: limit * 4,
  });

  const scored: RetrievedChunk[] = [];

  for (const row of rows) {
    scored.push({
      id: row.id,
      content: row.content,
      source: row.document?.filename ?? 'ملف',
      score: keywordScore(row.content, words),
      kind: 'document',
    });
  }
  for (const row of skillRows) {
    scored.push({
      id: row.id,
      content: row.content,
      source: row.skill?.title ?? 'مهارة',
      score: keywordScore(row.content, words),
      kind: 'skill',
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function keywordScore(content: string, words: string[]): number {
  const normalized = normalizeArabic(content);
  let hits = 0;
  for (const word of words) {
    if (normalized.includes(word)) hits += 1;
  }
  return words.length > 0 ? hits / words.length : 0;
}

/**
 * الاسترجاع الهجين: يدمج الدلالي مع الكلمات المفتاحية.
 * النتيجة النهائية = 0.7 × الدلالي + 0.3 × الكلمات.
 */
export async function retrieve(
  query: string,
  limit = RETRIEVE_LIMIT,
): Promise<RetrievedChunk[]> {
  const [semantic, keyword] = await Promise.all([
    semanticSearch(query, limit * 2),
    keywordSearch(query, limit * 2),
  ]);

  const merged = new Map<string, RetrievedChunk>();

  for (const chunk of semantic) {
    merged.set(chunk.id, { ...chunk, score: chunk.score * 0.7 });
  }
  for (const chunk of keyword) {
    const existing = merged.get(chunk.id);
    if (existing) {
      existing.score += chunk.score * 0.3;
    } else {
      merged.set(chunk.id, { ...chunk, score: chunk.score * 0.3 });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** يجهّز المعرفة كسطور جاهزة للحقن في برومبت النظام. */
export async function knowledgeForPrompt(query: string): Promise<string[]> {
  const lines: string[] = [];

  // المهارات الدائمة تدخل دايمًا، بدون استرجاع
  const alwaysOn = await prisma.skill.findMany({
    where: { enabled: true, alwaysOn: true },
    orderBy: { updatedAt: 'desc' },
  });
  for (const skill of alwaysOn) {
    lines.push(`مهارة "${skill.title}": ${skill.content}`);
  }

  const alwaysOnIds = new Set(alwaysOn.map((s) => s.id));
  const retrieved = await retrieve(query);

  for (const chunk of retrieved) {
    // ما نكرّر المهارات الدائمة
    if (chunk.kind === 'skill' && alwaysOn.some((s) => s.title === chunk.source)) continue;
    if (alwaysOnIds.has(chunk.id)) continue;
    lines.push(`من "${chunk.source}": ${chunk.content}`);
  }

  return lines;
}

export async function knowledgeStats(): Promise<{
  skills: number;
  activeSkills: number;
  documents: number;
  readyDocuments: number;
  chunks: number;
  embedded: number;
}> {
  const [skills, activeSkills, documents, readyDocuments, chunks, embedded] =
    await Promise.all([
      prisma.skill.count(),
      prisma.skill.count({ where: { enabled: true } }),
      prisma.document.count(),
      prisma.document.count({ where: { status: 'ready' } }),
      prisma.chunk.count(),
      prisma.chunk.count({ where: { dim: { not: null } } }),
    ]);

  return { skills, activeSkills, documents, readyDocuments, chunks, embedded };
}
