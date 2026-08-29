import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadArchive } from '../middleware/upload.middleware.js';
import { AppError, badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  MAX_ARCHIVE_MB,
  applyEdits,
  deleteProject,
  exportZip,
  getProject,
  importArchive,
  listFiles,
  listProjects,
  listRevisions,
  readProjectFile,
  readTextFile,
  revertRevision,
} from '../services/site.service.js';
import { buildDiff, diffStats, editSite } from '../services/site-agent.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.object({ id: z.string().min(1) });
const pathSchema = z.object({ path: z.string().min(1).max(500) });

// ── المشاريع ──

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ projects: await listProjects(), maxArchiveMb: MAX_ARCHIVE_MB });
  }),
);

router.post(
  '/',
  uploadArchive.single('archive'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('ارفع ملف ZIP');

    const isZip =
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream' ||
      /\.zip$/i.test(file.originalname);
    if (!isZip) throw badRequest('لازم يكون ملف ZIP');

    // ملفات ZIP تبدأ دائمًا بالتوقيع PK
    if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw badRequest('هذا مو ملف ZIP سليم');
    }

    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const { name: displayName } = z
      .object({ name: z.string().max(120).optional() })
      .parse(req.body);

    const result = await importArchive(name, file.buffer, displayName);
    res.status(201).json({
      project: { ...result.project, totalBytes: Number(result.project.totalBytes) },
      fileCount: result.fileCount,
      skipped: result.skipped,
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const [project, files, revisions] = await Promise.all([
      getProject(id),
      listFiles(id),
      listRevisions(id),
    ]);
    const { rootPath: _rootPath, totalBytes, ...rest } = project;
    res.json({
      project: { ...rest, totalBytes: Number(totalBytes) },
      files,
      revisions,
    });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    await deleteProject(id);
    res.status(204).end();
  }),
);

// ── الملفات ──

router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { path } = pathSchema.parse(req.query);
    res.json({ path, content: await readTextFile(id, path) });
  }),
);

router.put(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { path, content } = z
      .object({ path: z.string().min(1).max(500), content: z.string().max(500_000) })
      .parse(req.body);

    const result = await applyEdits(
      id,
      [{ relPath: path, action: 'update', content }],
      `تعديل يدوي: ${path}`,
    );
    res.json({ revisionId: result.revisionId, changes: result.changes.length });
  }),
);

// ── التعديل بالمحرك (ستريمنق) ──

router.post(
  '/:id/edit',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { instruction } = z
      .object({ instruction: z.string().min(1, 'اكتب وش تبي تعدّل').max(10_000) })
      .parse(req.body);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    try {
      send('start', { projectId: id });

      const result = await editSite(id, instruction, (chunk) => send('chunk', { text: chunk }));

      // نبني الفروق للعرض
      const diffs = result.changes.map((change) => {
        const lines = buildDiff(change.before, change.after);
        return {
          relPath: change.relPath,
          action: change.action,
          ...diffStats(lines),
          // نرسل الأسطر المتغيرة فقط مع سياق بسيط
          preview: compactDiff(lines),
        };
      });

      send('done', {
        summary: result.summary,
        revisionId: result.revisionId,
        changed: result.changes.length,
        diffs,
        ...(result.changes.length === 0 ? { raw: result.raw.slice(0, 2000) } : {}),
      });
    } catch (error) {
      logger.error('فشل تعديل الموقع', error);
      send('error', {
        code: error instanceof AppError ? error.code : 'EDIT_FAILED',
        message:
          error instanceof AppError ? error.message : 'ما قدرنا نعدّل الموقع. جرب مرة ثانية.',
      });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }),
);

/** يقص الفرق: الأسطر المتغيرة مع 3 أسطر سياق حولها. */
function compactDiff(
  lines: { kind: 'same' | 'add' | 'remove'; text: string }[],
): { kind: string; text: string }[] {
  const keep = new Set<number>();

  lines.forEach((line, index) => {
    if (line.kind === 'same') return;
    for (let i = Math.max(0, index - 3); i <= Math.min(lines.length - 1, index + 3); i += 1) {
      keep.add(i);
    }
  });

  const output: { kind: string; text: string }[] = [];
  let lastIndex = -1;

  for (const index of [...keep].sort((a, b) => a - b)) {
    if (lastIndex >= 0 && index > lastIndex + 1) {
      output.push({ kind: 'gap', text: '…' });
    }
    const line = lines[index]!;
    output.push({ kind: line.kind, text: line.text.slice(0, 300) });
    lastIndex = index;
    if (output.length > 200) break;
  }

  return output;
}

// ── المراجعات ──

router.post(
  '/:id/revert/:revisionId',
  asyncHandler(async (req, res) => {
    const { id, revisionId } = z
      .object({ id: z.string().min(1), revisionId: z.string().min(1) })
      .parse(req.params);
    await revertRevision(id, revisionId);
    res.json({ ok: true });
  }),
);

// ── التصدير ──

router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const project = await getProject(id);
    const zip = await exportZip(id);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`${project.slug}.zip`)}`,
    );
    res.send(zip);
  }),
);

// ── المعاينة المباشرة ──

/**
 * يقدّم ملفات الموقع للمعاينة.
 *
 * الحماية طبقتان:
 *
 * 1. الواجهة تعرضها داخل iframe بـ sandbox بدون allow-same-origin.
 * 2. ترويسة CSP sandbox على كل استجابة — وهذي هي الأهم، لأنها تجبر
 *    الصفحة على أصل معزول حتى لو فُتحت مباشرة في تبويب جديد. بدونها
 *    أي سكربت في موقع مرفوع (قالب جاهز نزّلته من النت مثلًا) يقدر
 *    يشتغل على أصل النظام ويقرأ جلستك ومفاتيحك وذاكرتك.
 */

/**
 * سياسة المعاينة: أصل معزول، بدون وصول لأي شي من أصل النظام.
 * نسمح بالسكربتات والنماذج عشان الموقع يشتغل طبيعي داخل عزلته.
 */
const PREVIEW_SANDBOX =
  'sandbox allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock';
router.get(
  '/:id/preview/*',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const requested = (req.params as unknown as { 0?: string })[0] ?? '';
    const project = await getProject(id);

    const relPath = requested === '' ? (project.entryFile ?? 'index.html') : requested;

    try {
      const { content, mime } = await readProjectFile(id, relPath);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Security-Policy', PREVIEW_SANDBOX);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(content);
    } catch {
      res.setHeader('Content-Security-Policy', PREVIEW_SANDBOX);
      res.status(404).type('text/html; charset=utf-8').send(
        `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
         <body style="font-family:system-ui;padding:2rem;background:#15171f;color:#eceef2">
         <h1>ما لقينا الملف</h1><p>${escapeHtml(relPath)}</p></body></html>`,
      );
    }
  }),
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
