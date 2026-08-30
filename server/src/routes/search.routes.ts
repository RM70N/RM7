import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { env } from '../lib/env.js';
import { fetchPage, needsSearch, search } from '../services/search.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1, 'اكتب وش تدوّر عليه').max(500),
        limit: z.coerce.number().int().min(1).max(15).optional(),
      })
      .parse(req.query);

    res.json({
      query: q,
      results: await search(q, limit ?? 8),
      provider: env.SEARXNG_URL ? 'searxng' : 'duckduckgo',
    });
  }),
);

router.get(
  '/page',
  asyncHandler(async (req, res) => {
    const { url } = z.object({ url: z.string().url('رابط غير صالح') }).parse(req.query);
    res.json(await fetchPage(url));
  }),
);

router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      autoSearch: env.AUTO_SEARCH,
      provider: env.SEARXNG_URL ? 'searxng' : 'duckduckgo',
      searxngConfigured: Boolean(env.SEARXNG_URL),
    });
  }),
);

router.post(
  '/should-search',
  asyncHandler(async (req, res) => {
    const { text } = z.object({ text: z.string().max(5000) }).parse(req.body);
    res.json({ needsSearch: needsSearch(text) });
  }),
);

export default router;
