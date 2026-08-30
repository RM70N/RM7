import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  sendMessage,
  togglePin,
} from '../services/chat.service.js';
import { assertEngineReady } from '../engine/inference.js';
import { engineInfo } from '../engine/runtime.js';
import { MODEL_CATALOG } from '../engine/catalog.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.object({ id: z.string().min(1) });
const createSchema = z.object({ title: z.string().max(200).optional() });
const renameSchema = z.object({ title: z.string().min(1).max(200) });
const pinSchema = z.object({ pinned: z.boolean() });
const sendSchema = z.object({
  text: z.string().min(1, 'اكتب رسالتك').max(50_000),
  /** يجبر البحث الحي حتى لو السؤال ما بان أنه يحتاجه */
  forceSearch: z.boolean().optional(),
});

// ── حالة المحرك ──

router.get(
  '/engine',
  asyncHandler(async (_req, res) => {
    const info = await engineInfo();
    res.json({
      ...info,
      catalog: MODEL_CATALOG.map(({ id, label, note, sizeGb, minRamGb, saudi }) => ({
        id,
        label,
        note,
        sizeGb,
        minRamGb,
        saudi,
      })),
    });
  }),
);

// ── المحادثات ──

router.get(
  '/conversations',
  asyncHandler(async (_req, res) => {
    res.json(await listConversations());
  }),
);

router.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const { title } = createSchema.parse(req.body);
    res.status(201).json(await createConversation(title));
  }),
);

router.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    res.json(await getConversation(id));
  }),
);

router.patch(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { title } = renameSchema.parse(req.body);
    res.json(await renameConversation(id, title));
  }),
);

router.patch(
  '/conversations/:id/pin',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { pinned } = pinSchema.parse(req.body);
    res.json(await togglePin(id, pinned));
  }),
);

router.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    await deleteConversation(id);
    res.status(204).end();
  }),
);

// ── الإرسال مع الستريمنق ──

/**
 * يبث الرد حرفًا بحرف عبر SSE.
 * الأحداث: start | chunk | done | error
 */
router.post(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { text, forceSearch } = sendSchema.parse(req.body);

    await assertEngineReady();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const controller = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    // نبض كل 15 ثانية حتى ما تنقطع الجلسة على الشبكات البطيئة
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    try {
      send('start', { conversationId: id });

      const result = await sendMessage({
        conversationId: id,
        text,
        signal: controller.signal,
        onChunk: (chunk) => send('chunk', { text: chunk }),
        onStatus: (status) => send('status', { text: status }),
        ...(forceSearch ? { forceSearch: true } : {}),
      });

      send('done', {
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        durationMs: result.durationMs,
        partial: result.partial,
        sources: result.sources,
      });
    } catch (error) {
      logger.error('فشل توليد الرد', error);
      send('error', {
        code: error instanceof AppError ? error.code : 'ENGINE_ERROR',
        message:
          error instanceof AppError
            ? error.message
            : 'المحرك ما قدر يرد. جرب مرة ثانية.',
      });
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }),
);

export default router;
