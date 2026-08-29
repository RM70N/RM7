import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadDocuments } from '../middleware/upload.middleware.js';
import { badRequest } from '../lib/errors.js';
import { SUPPORTED_TYPES } from '../lib/parsers.js';
import { embeddingInfo } from '../engine/embeddings.js';
import {
  createSkill,
  deleteDocument,
  deleteSkill,
  knowledgeStats,
  listDocuments,
  listSkills,
  readDocument,
  reindexAll,
  retrieve,
  updateSkill,
  uploadDocument,
} from '../services/knowledge.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.object({ id: z.string().min(1) });

const skillSchema = z.object({
  title: z.string().min(1, 'اكتب اسم المهارة').max(200),
  description: z.string().max(500).optional(),
  content: z.string().min(1, 'اكتب محتوى المهارة').max(100_000),
  tags: z.array(z.string().max(40)).max(20).optional(),
  enabled: z.boolean().optional(),
  alwaysOn: z.boolean().optional(),
});

// ── نظرة عامة ──

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [skills, documents, stats, embedding] = await Promise.all([
      listSkills(),
      listDocuments(),
      knowledgeStats(),
      embeddingInfo(),
    ]);
    res.json({
      skills,
      documents,
      stats,
      embedding,
      supportedTypes: SUPPORTED_TYPES,
    });
  }),
);

// ── المهارات ──

router.post(
  '/skills',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createSkill(skillSchema.parse(req.body)));
  }),
);

router.patch(
  '/skills/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    res.json(await updateSkill(id, skillSchema.partial().parse(req.body)));
  }),
);

router.delete(
  '/skills/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    await deleteSkill(id);
    res.status(204).end();
  }),
);

// ── الملفات ──

router.post(
  '/documents',
  uploadDocuments.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) throw badRequest('ما وصلنا أي ملف');

    const created = [];
    for (const file of files) {
      created.push(
        await uploadDocument({
          // multer يرجّع اسم الملف بترميز latin1 — نصلّحه عشان العربي
          filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
          mime: file.mimetype,
          buffer: file.buffer,
        }),
      );
    }

    res.status(201).json({ documents: created });
  }),
);

router.get(
  '/documents/:id/download',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { document, buffer } = await readDocument(id);

    res.setHeader('Content-Type', document.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    );
    res.send(buffer);
  }),
);

router.delete(
  '/documents/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    await deleteDocument(id);
    res.status(204).end();
  }),
);

// ── الاسترجاع وإعادة الفهرسة ──

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1, 'اكتب وش تدوّر عليه'),
        limit: z.coerce.number().int().min(1).max(20).optional(),
      })
      .parse(req.query);

    res.json({ results: await retrieve(q, limit) });
  }),
);

router.post(
  '/reindex',
  asyncHandler(async (_req, res) => {
    res.json(await reindexAll());
  }),
);

export default router;
