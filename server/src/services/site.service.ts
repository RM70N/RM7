import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import type { SiteProject, SiteStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../lib/logger.js';
import { badRequest, notFound } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { resolveStoragePath } from '../lib/storage.js';

/**
 * مشاريع المواقع المرفوعة.
 *
 * ملفات الموقع تُخزَّن غير مشفّرة (عشان المعاينة المباشرة تشتغل)، لكن
 * داخل مجلد معزول تحت التخزين، ولا يُقدَّم أي ملف إلا بعد تسجيل الدخول.
 */

/** أقصى عدد ملفات في المشروع الواحد. */
const MAX_FILES = 3000;
/** أقصى حجم ملف نصي نقرأه ونعرضه للمحرك. */
const MAX_TEXT_FILE = 300_000;

/** امتدادات نتعامل معها كنص (قابلة للقراءة والتعديل). */
const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.md', '.txt', '.xml', '.svg', '.yml', '.yaml',
  '.vue', '.svelte', '.php', '.py', '.rb', '.go', '.java',
  '.env', '.gitignore', '.editorconfig', '.toml', '.ini', '.sh',
]);

/** مسارات ما ننسخها أبدًا من الأرشيف. */
const SKIP_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)__MACOSX\//,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)\.next\//,
  /(^|\/)dist\/.*\.map$/,
];

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.md': 'text/markdown', '.txt': 'text/plain',
};

export function mimeFor(relPath: string): string {
  return MIME_BY_EXT[extname(relPath).toLowerCase()] ?? 'application/octet-stream';
}

export function isTextFile(relPath: string): boolean {
  const ext = extname(relPath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // ملفات بدون امتداد شائعة في المشاريع
  return ext === '' && /^(README|LICENSE|Dockerfile|Makefile)$/i.test(relPath.split('/').pop() ?? '');
}

function shouldSkip(relPath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(relPath));
}

/** يحوّل الاسم لمعرّف آمن في المسارات وعناوين المعاينة. */
export function slugify(name: string): string {
  const base = name
    .replace(/\.(zip|tar|gz)$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase();
  return `${base || 'site'}-${randomUUID().slice(0, 8)}`;
}

/**
 * ينظّف مسارًا قادمًا من أرشيف ويتأكد أنه يبقى داخل مجلد المشروع.
 * هذي الحماية من ثغرة zip-slip.
 */
export function safeEntryPath(entryName: string): string | null {
  // نوحّد الفواصل ونشيل أي محاولة صعود
  const unified = entryName.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[a-zA-Z]:/.test(unified)) return null;

  const normalized = normalize(unified).replace(/\\/g, '/');
  if (normalized.startsWith('..') || normalized.includes('../')) return null;
  if (normalized.includes('\0')) return null;

  const clean = normalized.replace(/^\.\//, '').replace(/^\/+/, '');
  return clean === '' || clean === '.' ? null : clean;
}

/**
 * لو كل الملفات تحت مجلد جذر واحد (شائع في ملفات ZIP)، نشيله
 * حتى يكون index.html في الجذر مباشرة.
 */
export function stripCommonRoot(paths: string[]): string {
  if (paths.length === 0) return '';

  const firstSegments = new Set(
    paths.map((p) => (p.includes('/') ? p.slice(0, p.indexOf('/')) : '')),
  );
  if (firstSegments.size !== 1) return '';

  const [root] = [...firstSegments];
  if (!root) return '';
  // نتأكد أن ما فيه ملف في الجذر نفسه
  return paths.every((p) => p.startsWith(`${root}/`)) ? `${root}/` : '';
}

/** هل الخطأ ناتج عن مسار خطر في الأرشيف؟ */
function isUnsafePathError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /relative path|absolute path|invalid.*path|outside/i.test(error.message);
}

// ───────────────────────── الاستيراد ─────────────────────────

export interface ImportResult {
  project: SiteProject;
  fileCount: number;
  skipped: number;
}

/** يستورد أرشيف ZIP كمشروع موقع جديد. */
export async function importArchive(
  archiveName: string,
  buffer: Buffer,
  displayName?: string,
): Promise<ImportResult> {
  const { default: yauzl } = await import('yauzl-promise');

  const slug = slugify(displayName || archiveName);
  const rootPath = `sites/${slug}`;
  const absoluteRoot = resolveStoragePath(rootPath);

  const project = await prisma.siteProject.create({
    data: {
      name: (displayName || archiveName.replace(/\.zip$/i, '')).slice(0, 120),
      slug,
      rootPath,
      status: 'importing',
    },
  });

  try {
    await mkdir(absoluteRoot, { recursive: true });

    // نمر مرتين: الأولى نجمع الأسماء عشان نعرف الجذر المشترك
    const names: string[] = [];
    const zipForNames = await yauzl.fromBuffer(buffer);
    try {
      for await (const entry of zipForNames) {
        if (entry.filename.endsWith('/')) continue;
        const safe = safeEntryPath(entry.filename);
        if (safe && !shouldSkip(safe)) names.push(safe);
      }
    } catch (error) {
      // بعض المكتبات ترمي قبل ما نفحص نحن — نترجم الخطأ لرسالة مفهومة
      if (isUnsafePathError(error)) {
        throw badRequest(
          'الأرشيف فيه مسارات تحاول تخرج من مجلد المشروع. رفضناه كامل للأمان.',
        );
      }
      throw error;
    } finally {
      await zipForNames.close();
    }

    if (names.length === 0) {
      throw badRequest('الأرشيف فاضي أو ما فيه ملفات مفيدة');
    }
    if (names.length > MAX_FILES) {
      throw badRequest(`الأرشيف فيه ${names.length} ملف — الحد ${MAX_FILES}`);
    }

    const commonRoot = stripCommonRoot(names);

    let written = 0;
    let skipped = 0;
    let totalBytes = 0;

    const zip = await yauzl.fromBuffer(buffer);
    try {
      for await (const entry of zip) {
        if (entry.filename.endsWith('/')) continue;

        const safe = safeEntryPath(entry.filename);
        if (!safe) {
          skipped += 1;
          logger.warn(`تجاهلنا مسارًا خطرًا في الأرشيف: ${entry.filename}`);
          continue;
        }
        if (shouldSkip(safe)) {
          skipped += 1;
          continue;
        }

        const relPath = commonRoot && safe.startsWith(commonRoot)
          ? safe.slice(commonRoot.length)
          : safe;
        if (!relPath) {
          skipped += 1;
          continue;
        }

        const stream = await entry.openReadStream();
        const parts: Buffer[] = [];
        for await (const part of stream) parts.push(part as Buffer);
        const content = Buffer.concat(parts);

        // تحقق ثانٍ: المسار النهائي لازم يبقى داخل مجلد المشروع
        const target = join(absoluteRoot, relPath);
        const rel = relative(absoluteRoot, target);
        if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
          skipped += 1;
          logger.warn(`تجاهلنا مسارًا يخرج من المشروع: ${relPath}`);
          continue;
        }

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);

        await prisma.siteFile.create({
          data: {
            projectId: project.id,
            relPath,
            mime: mimeFor(relPath),
            size: content.length,
            hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
            isText: isTextFile(relPath),
          },
        });

        written += 1;
        totalBytes += content.length;
      }
    } catch (error) {
      if (isUnsafePathError(error)) {
        throw badRequest(
          'الأرشيف فيه مسارات تحاول تخرج من مجلد المشروع. رفضناه كامل للأمان.',
        );
      }
      throw error;
    } finally {
      await zip.close();
    }

    const entryFile = await detectEntryFile(project.id);

    const updated = await prisma.siteProject.update({
      where: { id: project.id },
      data: {
        status: 'ready' as SiteStatus,
        fileCount: written,
        totalBytes: BigInt(totalBytes),
        entryFile,
      },
    });

    logger.info(`استوردنا موقع "${updated.name}" — ${written} ملف`);
    return { project: updated, fileCount: written, skipped };
  } catch (error) {
    // ما نخلّي مشاريع فاشلة تتراكم — الخطأ يرجع للمستخدم في الرد مباشرة
    await rm(absoluteRoot, { recursive: true, force: true }).catch(() => undefined);
    await prisma.siteProject.delete({ where: { id: project.id } }).catch(() => undefined);
    throw error;
  }
}

/** يلقى الصفحة الرئيسية للموقع. */
async function detectEntryFile(projectId: string): Promise<string | null> {
  const candidates = ['index.html', 'index.htm', 'public/index.html', 'src/index.html'];
  const files = await prisma.siteFile.findMany({
    where: { projectId },
    select: { relPath: true },
  });
  const paths = new Set(files.map((f) => f.relPath));

  for (const candidate of candidates) {
    if (paths.has(candidate)) return candidate;
  }
  // أي ملف HTML
  const html = files.find((f) => f.relPath.endsWith('.html'));
  return html?.relPath ?? null;
}

// ───────────────────────── القراءة ─────────────────────────

export async function listProjects(): Promise<
  (Omit<SiteProject, 'totalBytes' | 'rootPath'> & { totalBytes: number })[]
> {
  const rows = await prisma.siteProject.findMany({ orderBy: { updatedAt: 'desc' } });
  return rows.map(({ totalBytes, rootPath: _rootPath, ...rest }) => ({
    ...rest,
    totalBytes: Number(totalBytes),
  }));
}

export async function getProject(id: string): Promise<SiteProject> {
  const project = await prisma.siteProject.findUnique({ where: { id } });
  if (!project) throw notFound('ما لقينا هذا المشروع');
  return project;
}

export interface FileNode {
  relPath: string;
  size: number;
  mime: string;
  isText: boolean;
}

export async function listFiles(projectId: string): Promise<FileNode[]> {
  await getProject(projectId);
  const files = await prisma.siteFile.findMany({
    where: { projectId },
    orderBy: { relPath: 'asc' },
    select: { relPath: true, size: true, mime: true, isText: true },
  });
  return files;
}

/** يقرأ محتوى ملف داخل المشروع. */
export async function readProjectFile(
  projectId: string,
  relPath: string,
): Promise<{ content: Buffer; isText: boolean; mime: string }> {
  const project = await getProject(projectId);
  const safe = safeEntryPath(relPath);
  if (!safe) throw badRequest('مسار غير مسموح');

  const absolute = resolveStoragePath(join(project.rootPath, safe));
  const root = resolveStoragePath(project.rootPath);
  if (!absolute.startsWith(root + sep)) throw badRequest('مسار غير مسموح');

  try {
    const content = await readFile(absolute);
    return { content, isText: isTextFile(safe), mime: mimeFor(safe) };
  } catch {
    throw notFound(`ما لقينا الملف ${safe}`);
  }
}

/** يقرأ ملفًا نصيًا كنص. */
export async function readTextFile(projectId: string, relPath: string): Promise<string> {
  const { content, isText } = await readProjectFile(projectId, relPath);
  if (!isText) throw badRequest('هذا الملف مو نصي');
  if (content.length > MAX_TEXT_FILE) {
    throw badRequest(`الملف أكبر من ${Math.round(MAX_TEXT_FILE / 1000)} ألف حرف`);
  }
  return content.toString('utf8');
}

// ───────────────────────── التعديل ─────────────────────────

export interface FileEdit {
  relPath: string;
  action: 'update' | 'create' | 'delete';
  content?: string;
}

export interface AppliedChange {
  relPath: string;
  action: FileEdit['action'];
  before: string | null;
  after: string | null;
}

/**
 * يطبّق مجموعة تعديلات، ويحفظ نسخة احتياطية ومراجعة قابلة للرجوع.
 */
export async function applyEdits(
  projectId: string,
  edits: FileEdit[],
  summary: string,
): Promise<{ revisionId: string; changes: AppliedChange[] }> {
  const project = await getProject(projectId);
  if (edits.length === 0) throw badRequest('ما فيه أي تعديل');

  const root = resolveStoragePath(project.rootPath);
  const backupPath = `sites/.backups/${project.slug}-${Date.now()}`;

  // نسخة احتياطية كاملة قبل أي تعديل
  await mkdir(dirname(resolveStoragePath(backupPath)), { recursive: true });
  await cp(root, resolveStoragePath(backupPath), { recursive: true });

  const changes: AppliedChange[] = [];

  for (const edit of edits) {
    const safe = safeEntryPath(edit.relPath);
    if (!safe) throw badRequest(`مسار غير مسموح: ${edit.relPath}`);

    const absolute = join(root, safe);
    const rel = relative(root, absolute);
    if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
      throw badRequest(`مسار يخرج من المشروع: ${edit.relPath}`);
    }

    let before: string | null = null;
    try {
      before = await readFile(absolute, 'utf8');
    } catch {
      before = null;
    }

    if (edit.action === 'delete') {
      if (before === null) continue;
      await rm(absolute, { force: true });
      await prisma.siteFile.deleteMany({ where: { projectId, relPath: safe } });
      changes.push({ relPath: safe, action: 'delete', before, after: null });
      continue;
    }

    const content = edit.content ?? '';
    if (!isTextFile(safe)) throw badRequest(`ما نقدر نعدّل ملفًا غير نصي: ${safe}`);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');

    const size = Buffer.byteLength(content, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    await prisma.siteFile.upsert({
      where: { projectId_relPath: { projectId, relPath: safe } },
      create: {
        projectId,
        relPath: safe,
        mime: mimeFor(safe),
        size,
        hash,
        isText: true,
      },
      update: { size, hash },
    });

    changes.push({
      relPath: safe,
      action: before === null ? 'create' : 'update',
      before,
      after: content,
    });
  }

  if (changes.length === 0) {
    await rm(resolveStoragePath(backupPath), { recursive: true, force: true });
    throw badRequest('ما تغيّر أي شي');
  }

  const revision = await prisma.siteRevision.create({
    data: {
      projectId,
      summary,
      backupPath,
      changes: changes.map((c) => ({
        relPath: c.relPath,
        action: c.action,
        beforeLength: c.before?.length ?? 0,
        afterLength: c.after?.length ?? 0,
      })) as never,
    },
  });

  await refreshProjectStats(projectId);

  return { revisionId: revision.id, changes };
}

/** يرجّع الموقع لحالته قبل مراجعة معيّنة. */
export async function revertRevision(projectId: string, revisionId: string): Promise<void> {
  const project = await getProject(projectId);
  const revision = await prisma.siteRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.projectId !== projectId) throw notFound('ما لقينا هذي المراجعة');
  if (!revision.backupPath) throw badRequest('ما فيه نسخة احتياطية لهذي المراجعة');

  const backup = resolveStoragePath(revision.backupPath);
  const root = resolveStoragePath(project.rootPath);

  await rm(root, { recursive: true, force: true });
  await cp(backup, root, { recursive: true });

  // نعيد بناء فهرس الملفات من القرص
  await prisma.siteFile.deleteMany({ where: { projectId } });
  await reindexFiles(projectId, root, root);
  await refreshProjectStats(projectId);

  await prisma.siteRevision.delete({ where: { id: revisionId } });
  logger.info(`رجّعنا موقع "${project.name}" للنسخة السابقة`);
}

async function reindexFiles(projectId: string, root: string, dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      await reindexFiles(projectId, root, absolute);
      continue;
    }

    const relPath = relative(root, absolute).replace(/\\/g, '/');
    if (shouldSkip(relPath)) continue;

    const content = await readFile(absolute);
    await prisma.siteFile.create({
      data: {
        projectId,
        relPath,
        mime: mimeFor(relPath),
        size: content.length,
        hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
        isText: isTextFile(relPath),
      },
    });
  }
}

async function refreshProjectStats(projectId: string): Promise<void> {
  const files = await prisma.siteFile.findMany({
    where: { projectId },
    select: { size: true },
  });
  await prisma.siteProject.update({
    where: { id: projectId },
    data: {
      fileCount: files.length,
      totalBytes: BigInt(files.reduce((sum, f) => sum + f.size, 0)),
      updatedAt: new Date(),
    },
  });
}

export async function listRevisions(projectId: string) {
  await getProject(projectId);
  return prisma.siteRevision.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, summary: true, changes: true, createdAt: true },
  });
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);

  const revisions = await prisma.siteRevision.findMany({
    where: { projectId: id },
    select: { backupPath: true },
  });
  for (const revision of revisions) {
    if (revision.backupPath) {
      await rm(resolveStoragePath(revision.backupPath), { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  await rm(resolveStoragePath(project.rootPath), { recursive: true, force: true }).catch(
    () => undefined,
  );
  await prisma.siteProject.delete({ where: { id } });
}

// ───────────────────────── التصدير ─────────────────────────

/** يحزم الموقع كملف ZIP جاهز للتحميل. */
export async function exportZip(projectId: string): Promise<Buffer> {
  const project = await getProject(projectId);
  const root = resolveStoragePath(project.rootPath);

  // archiver 8 يصدّر أصنافًا لكل صيغة، بدون دالة افتراضية
  const { ZipArchive } = await import('archiver');
  const archive = new ZipArchive({ zlib: { level: 9 } });

  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', reject);
  });

  archive.directory(root, false);
  await archive.finalize();
  await finished;

  return Buffer.concat(chunks);
}

// ───────────────────────── السياق للمحرك ─────────────────────────

export interface SiteContext {
  tree: string;
  files: { relPath: string; content: string }[];
}

/**
 * يبني وصفًا للموقع يفهمه المحرك: شجرة الملفات + محتوى أهم الملفات.
 * نحدّ الحجم عشان ما نفجّر نافذة السياق.
 */
export async function buildSiteContext(
  projectId: string,
  maxChars = 24_000,
): Promise<SiteContext> {
  const files = await listFiles(projectId);

  const tree = files
    .map((f) => `  ${f.relPath} (${f.size} بايت${f.isText ? '' : '، ثنائي'})`)
    .join('\n');

  // نرتّب: HTML أولًا، ثم CSS، ثم JS، ثم الباقي
  const priority = (relPath: string): number => {
    if (/index\.html?$/i.test(relPath)) return 0;
    if (/\.html?$/i.test(relPath)) return 1;
    if (/\.(css|scss)$/i.test(relPath)) return 2;
    if (/\.(js|jsx|ts|tsx)$/i.test(relPath)) return 3;
    if (/\.json$/i.test(relPath)) return 5;
    return 4;
  };

  const textFiles = files
    .filter((f) => f.isText && f.size < 60_000)
    .sort((a, b) => priority(a.relPath) - priority(b.relPath) || a.size - b.size);

  const included: { relPath: string; content: string }[] = [];
  let used = 0;

  for (const file of textFiles) {
    if (used >= maxChars) break;
    try {
      const content = await readTextFile(projectId, file.relPath);
      const budget = maxChars - used;
      const trimmed =
        content.length > budget
          ? `${content.slice(0, budget)}\n… (الملف مقصوص)`
          : content;
      included.push({ relPath: file.relPath, content: trimmed });
      used += trimmed.length;
    } catch {
      // ملف ما نقدر نقراه — نتجاوزه
    }
  }

  return { tree, files: included };
}

/** يجهّز السياق كنص جاهز لبرومبت النظام. */
export async function siteContextText(projectId: string): Promise<string> {
  const project = await getProject(projectId);
  const { tree, files } = await buildSiteContext(projectId);

  const parts = [
    `المشروع: ${project.name}`,
    `الصفحة الرئيسية: ${project.entryFile ?? 'غير محددة'}`,
    '',
    'شجرة الملفات:',
    tree,
    '',
    'محتوى الملفات:',
  ];

  for (const file of files) {
    parts.push(`\n--- ${file.relPath} ---\n${file.content}`);
  }

  return parts.join('\n');
}

/** الحد الأقصى لحجم الأرشيف — للعرض في الواجهة. */
export const MAX_ARCHIVE_MB = env.MAX_UPLOAD_MB;
