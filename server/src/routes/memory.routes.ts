import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  CATEGORY_LABELS,
  createMemory,
  deleteAllMemories,
  deleteMemory,
  listMemories,
  memoryStats,
  updateMemory,
} from '../services/memory.service.js';

const router = Router();
router.use(requireAuth);

const categorySchema = z.enum(['personal', 'preference', 'project', 'fact', 'instruction']);

const createSchema = z.object({
  title: z.string().min(1, 'اكتب عنوان').max(200),
  content: z.string().min(1, 'اكتب المحتوى').max(5000),
  category: categorySchema.optional(),
  importance: z.number().int().min(1).max(5).optional(),
  pinned: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const querySchema = z.object({
  category: categorySchema.optional(),
  search: z.string().max(200).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = querySchema.parse(req.query);
    const [memories, stats] = await Promise.all([listMemories(filter), memoryStats()]);
    res.json({ memories, stats, labels: CATEGORY_LABELS });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createMemory(createSchema.parse(req.body)));
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    res.json(await updateMemory(id, updateSchema.parse(req.body)));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await deleteMemory(id);
    res.status(204).end();
  }),
);

/** يمسح الذكريات غير المثبّتة — المثبّتة تبقى دائمًا. */
router.post(
  '/clear',
  asyncHandler(async (req, res) => {
    const { source } = z
      .object({ source: z.enum(['auto', 'manual']).optional() })
      .parse(req.body);
    const removed = await deleteAllMemories(source);
    res.json({ ok: true, removed });
  }),
);

export default router;
