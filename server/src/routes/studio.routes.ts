import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  createCustomImage,
  createImage,
  createMotion,
  createSlideshow,
  deleteAsset,
  listAssets,
  readAsset,
  studioInfo,
  toPublicAsset,
} from '../services/studio.service.js';

const router = Router();
router.use(requireAuth);

const idSchema = z.object({ id: z.string().min(1) });

const imageSchema = z.object({
  template: z.string().min(1),
  palette: z.string().min(1),
  title: z.string().min(1, 'اكتب العنوان').max(400),
  subtitle: z.string().max(600).optional(),
  badge: z.string().max(60).optional(),
});

const customImageSchema = z.object({
  title: z.string().max(120).optional(),
  html: z.string().min(1, 'اكتب محتوى التصميم').max(200_000),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
});

const motionSchema = z.object({
  template: z.string().min(1),
  palette: z.string().min(1),
  title: z.string().min(1, 'اكتب العنوان').max(300),
  subtitle: z.string().max(300).optional(),
  durationSec: z.number().min(1).max(30),
  width: z.number().int().min(128).max(1920),
  height: z.number().int().min(128).max(1920),
  fps: z.number().int().min(1).max(60),
});

const slideshowSchema = z.object({
  title: z.string().max(120).optional(),
  imageIds: z.array(z.string().min(1)).min(1, 'اختر صورة وحدة على الأقل').max(40),
  secondsPerImage: z.number().min(0.5).max(15),
  crossfade: z.boolean().optional(),
  fps: z.number().int().min(1).max(60).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { kind } = z
      .object({ kind: z.enum(['image', 'video', 'motion']).optional() })
      .parse(req.query);

    const [info, assets] = await Promise.all([studioInfo(), listAssets(kind)]);
    res.json({ ...info, assets });
  }),
);

router.post(
  '/image',
  asyncHandler(async (req, res) => {
    const asset = await createImage(imageSchema.parse(req.body));
    res.status(201).json(toPublicAsset(asset));
  }),
);

router.post(
  '/image/custom',
  asyncHandler(async (req, res) => {
    const input = customImageSchema.parse(req.body);
    const asset = await createCustomImage(
      input.title ?? 'تصميم مخصص',
      input.html,
      input.width,
      input.height,
    );
    res.status(201).json(toPublicAsset(asset));
  }),
);

router.post(
  '/motion',
  asyncHandler(async (req, res) => {
    const asset = await createMotion(motionSchema.parse(req.body));
    res.status(201).json(toPublicAsset(asset));
  }),
);

router.post(
  '/video',
  asyncHandler(async (req, res) => {
    const input = slideshowSchema.parse(req.body);
    const asset = await createSlideshow({
      title: input.title ?? 'عرض صور',
      imageIds: input.imageIds,
      secondsPerImage: input.secondsPerImage,
      crossfade: input.crossfade ?? false,
      fps: input.fps ?? 30,
    });
    res.status(201).json(toPublicAsset(asset));
  }),
);

router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { thumb } = z.object({ thumb: z.string().optional() }).parse(req.query);

    const { asset, buffer } = await readAsset(id, thumb ? 'thumb' : 'main');
    res.setHeader('Content-Type', thumb ? 'image/png' : (asset.mime ?? 'application/octet-stream'));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  }),
);

router.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    const { asset, buffer } = await readAsset(id);

    const ext = asset.mime === 'video/mp4' ? 'mp4' : 'png';
    const name = `${asset.title || 'احسمها'}.${ext}`;

    res.setHeader('Content-Type', asset.mime ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    res.send(buffer);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idSchema.parse(req.params);
    await deleteAsset(id);
    res.status(204).end();
  }),
);

export default router;
