import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireApiKey } from '../middleware/apikey.middleware.js';
import { IDENTITY } from '../engine/persona.js';
import { engineInfo } from '../engine/runtime.js';
import { assertEngineReady, generate } from '../engine/inference.js';
import { memoriesForPrompt } from '../services/memory.service.js';
import { knowledgeForPrompt, retrieve } from '../services/knowledge.service.js';
import { search } from '../services/search.service.js';
import { createImage } from '../services/studio.service.js';
import { toPublicAsset } from '../services/studio.service.js';

/**
 * API احسمها العام — للاستخدام من تطبيقاتك الخارجية.
 * كل مسار محمي بمفتاح تصدره أنت، وله صلاحية محددة.
 */

const router = Router();

/** حد أشد على الـ API الخارجي. */
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.get('x-ahsmaha-key')?.slice(0, 24) ?? req.ip ?? 'unknown',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'طلبات كثيرة — هدّي شوي' } },
});

router.use(apiLimiter);

/** معلومات الخدمة — بدون مفتاح. */
router.get('/', (_req, res) => {
  res.json({
    service: IDENTITY.fullName,
    engine: IDENTITY.engine,
    version: IDENTITY.version,
    docs: '/api/v1/docs',
    auth: 'أرسل مفتاحك في ترويسة x-ahsmaha-key',
  });
});

router.get('/docs', (_req, res) => {
  res.json({
    service: IDENTITY.fullName,
    auth: {
      header: 'x-ahsmaha-key',
      alternative: 'Authorization: Bearer <key>',
      note: 'المفاتيح تُصدر من صفحة الإعدادات، وتُعرض مرة وحدة فقط',
    },
    endpoints: [
      { method: 'GET', path: '/api/v1/status', scope: 'chat', note: 'حالة المحرك' },
      { method: 'POST', path: '/api/v1/chat', scope: 'chat', note: 'رد واحد على رسالة', body: { message: 'string', useMemory: 'boolean?', useKnowledge: 'boolean?' } },
      { method: 'POST', path: '/api/v1/knowledge/search', scope: 'knowledge', note: 'بحث في ملفاتك ومهاراتك', body: { query: 'string', limit: 'number?' } },
      { method: 'POST', path: '/api/v1/search', scope: 'search', note: 'بحث حي على الإنترنت', body: { query: 'string', limit: 'number?' } },
      { method: 'POST', path: '/api/v1/image', scope: 'studio', note: 'توليد صورة', body: { template: 'string', palette: 'string', title: 'string', subtitle: 'string?', badge: 'string?' } },
    ],
    limits: { requestsPerMinute: 60 },
  });
});

router.get(
  '/status',
  requireApiKey('chat'),
  asyncHandler(async (_req, res) => {
    const info = await engineInfo();
    res.json({
      service: IDENTITY.fullName,
      engine: IDENTITY.engine,
      ready: info.ready,
      contextSize: info.contextSize,
      accelerator: info.gpu,
    });
  }),
);

router.post(
  '/chat',
  requireApiKey('chat'),
  asyncHandler(async (req, res) => {
    const { message, useMemory, useKnowledge, temperature, maxTokens } = z
      .object({
        message: z.string().min(1, 'اكتب الرسالة').max(20_000),
        useMemory: z.boolean().optional(),
        useKnowledge: z.boolean().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(1).max(4000).optional(),
      })
      .parse(req.body);

    await assertEngineReady();

    const [memories, knowledge] = await Promise.all([
      useMemory === false ? Promise.resolve([]) : memoriesForPrompt(message),
      useKnowledge === false ? Promise.resolve([]) : knowledgeForPrompt(message),
    ]);

    const result = await generate({
      prompt: message,
      context: {
        ...(memories.length > 0 ? { memories } : {}),
        ...(knowledge.length > 0 ? { knowledge } : {}),
      },
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    });

    res.json({
      reply: result.text,
      engine: IDENTITY.engine,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs: result.durationMs,
      },
    });
  }),
);

router.post(
  '/knowledge/search',
  requireApiKey('knowledge'),
  asyncHandler(async (req, res) => {
    const { query, limit } = z
      .object({
        query: z.string().min(1, 'اكتب وش تدوّر عليه').max(1000),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(req.body);

    res.json({ results: await retrieve(query, limit ?? 6) });
  }),
);

router.post(
  '/search',
  requireApiKey('search'),
  asyncHandler(async (req, res) => {
    const { query, limit } = z
      .object({
        query: z.string().min(1, 'اكتب وش تدوّر عليه').max(500),
        limit: z.number().int().min(1).max(15).optional(),
      })
      .parse(req.body);

    res.json({ results: await search(query, limit ?? 6) });
  }),
);

router.post(
  '/image',
  requireApiKey('studio'),
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        template: z.string().min(1),
        palette: z.string().min(1),
        title: z.string().min(1).max(400),
        subtitle: z.string().max(600).optional(),
        badge: z.string().max(60).optional(),
      })
      .parse(req.body);

    const asset = await createImage(input);
    res.status(201).json({
      ...toPublicAsset(asset),
      url: `/api/studio/${asset.id}/file`,
    });
  }),
);

export default router;
