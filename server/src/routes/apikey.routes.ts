import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  SCOPES,
  SCOPE_LABELS,
  deleteKey,
  issueKey,
  listKeys,
  revokeKey,
  type Scope,
} from '../services/apikey.service.js';
import { recordAudit } from '../services/auth.service.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ keys: await listKeys(), scopes: SCOPES, labels: SCOPE_LABELS });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, scopes } = z
      .object({
        name: z.string().min(1, 'اكتب اسم للمفتاح').max(120),
        scopes: z.array(z.enum(SCOPES)).min(1, 'اختر صلاحية وحدة على الأقل'),
      })
      .parse(req.body);

    const issued = await issueKey(name, scopes as Scope[]);
    await recordAudit('apikey.issued', { name, scopes }, req.ip);

    res.status(201).json(issued);
  }),
);

router.post(
  '/:id/revoke',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await revokeKey(id);
    await recordAudit('apikey.revoked', { id }, req.ip);
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await deleteKey(id);
    await recordAudit('apikey.deleted', { id }, req.ip);
    res.status(204).end();
  }),
);

export default router;
