import { spawn } from 'node:child_process';

import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MediaAsset, MediaKind } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { resolveStoragePath, removePath } from '../lib/storage.js';
import { renderFrames, renderToImage, rendererInfo } from './renderer.service.js';
import {
  IMAGE_TEMPLATES,
  MOTION_TEMPLATES,
  PALETTES,
  buildImageHtml,
  buildMotionHtml,
  imageTemplateById,
  motionTemplateById,
  type ImageSpec,
} from './templates.service.js';

/**
 * استوديو احسمها — توليد الصور والفيديو والموشن محليًا بالكامل.
 * الرسم بمتصفح بلا واجهة، والترميز بـ ffmpeg. ولا مزود خارجي.
 */

const MAX_DURATION_SEC = 30;
const MAX_FPS = 60;

export interface StudioInfo {
  renderer: ReturnType<typeof rendererInfo>;
  ffmpeg: { available: boolean; version: string | null };
  imageTemplates: typeof IMAGE_TEMPLATES;
  motionTemplates: typeof MOTION_TEMPLATES;
  palettes: typeof PALETTES;
  limits: { maxDurationSec: number; maxFps: number };
}

let ffmpegVersion: string | null | undefined;

/** يفحص وجود ffmpeg مرة وحدة ويحفظ النتيجة. */
export async function checkFfmpeg(): Promise<{ available: boolean; version: string | null }> {
  if (ffmpegVersion !== undefined) {
    return { available: ffmpegVersion !== null, version: ffmpegVersion };
  }

  ffmpegVersion = await new Promise<string | null>((resolve) => {
    const child = spawn(env.FFMPEG_PATH, ['-version']);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const match = output.match(/ffmpeg version (\S+)/);
      resolve(match?.[1] ?? 'غير معروف');
    });
  });

  return { available: ffmpegVersion !== null, version: ffmpegVersion };
}

export async function studioInfo(): Promise<StudioInfo> {
  return {
    renderer: rendererInfo(),
    ffmpeg: await checkFfmpeg(),
    imageTemplates: IMAGE_TEMPLATES,
    motionTemplates: MOTION_TEMPLATES,
    palettes: PALETTES,
    limits: { maxDurationSec: MAX_DURATION_SEC, maxFps: MAX_FPS },
  };
}

/** ينفّذ ffmpeg ويرجّع خطأ عربيًا واضحًا عند الفشل. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.FFMPEG_PATH, args);
    let stderr = '';

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });

    child.on('error', () =>
      reject(new AppError(503, 'NO_FFMPEG', 'ما لقينا ffmpeg. ثبّته أو حط مساره في FFMPEG_PATH.')),
    );

    child.on('close', (code) => {
      if (code === 0) return resolve();
      logger.error(`ffmpeg فشل بالرمز ${code}`, stderr.slice(-1200));
      reject(new AppError(500, 'RENDER_FAILED', 'فشل ترميز الفيديو', stderr.slice(-500)));
    });
  });
}

// ───────────────────────── الصور ─────────────────────────

export interface CreateImageInput extends ImageSpec {
  title_?: never;
}

export async function createImage(input: ImageSpec): Promise<MediaAsset> {
  const template = imageTemplateById(input.template);
  if (!template) throw badRequest('قالب صورة غير معروف');
  if (!input.title.trim()) throw badRequest('اكتب العنوان');

  const { html, width, height } = buildImageHtml(input);

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'image',
      title: input.title.slice(0, 120),
      prompt: input.title,
      spec: input as unknown as object,
      status: 'rendering',
      width,
      height,
    },
  });

  try {
    const png = await renderToImage({ html, width, height, scale: 1 });
    const relPath = `generated/${asset.id}.png`;
    await writeFile(resolveStoragePath(relPath), png);

    return await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        path: relPath,
        mime: 'image/png',
        sizeBytes: png.length,
      },
    });
  } catch (error) {
    await markFailed(asset.id, error);
    throw error;
  }
}

/** يرسم HTML مخصص (يكتبه المحرك من وصفك). */
export async function createCustomImage(
  title: string,
  html: string,
  width: number,
  height: number,
): Promise<MediaAsset> {
  if (width < 64 || width > 4096 || height < 64 || height > 4096) {
    throw badRequest('الأبعاد لازم بين 64 و4096');
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'image',
      title: title.slice(0, 120) || 'تصميم مخصص',
      prompt: title,
      spec: { custom: true, width, height } as unknown as object,
      status: 'rendering',
      width,
      height,
    },
  });

  try {
    const png = await renderToImage({ html, width, height });
    const relPath = `generated/${asset.id}.png`;
    await writeFile(resolveStoragePath(relPath), png);

    return await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: 'ready', path: relPath, mime: 'image/png', sizeBytes: png.length },
    });
  } catch (error) {
    await markFailed(asset.id, error);
    throw error;
  }
}

// ───────────────────────── الموشن جرافيك ─────────────────────────

export interface CreateMotionInput {
  template: string;
  palette: string;
  title: string;
  subtitle?: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export async function createMotion(input: CreateMotionInput): Promise<MediaAsset> {
  const template = motionTemplateById(input.template);
  if (!template) throw badRequest('قالب موشن غير معروف');
  if (!input.title.trim()) throw badRequest('اكتب العنوان');
  if (input.durationSec < 1 || input.durationSec > MAX_DURATION_SEC) {
    throw badRequest(`المدة لازم بين 1 و${MAX_DURATION_SEC} ثانية`);
  }
  if (input.fps < 1 || input.fps > MAX_FPS) throw badRequest(`الإطارات لازم بين 1 و${MAX_FPS}`);

  const ffmpeg = await checkFfmpeg();
  if (!ffmpeg.available) {
    throw new AppError(503, 'NO_FFMPEG', 'ما لقينا ffmpeg. ثبّته عشان تقدر تصدّر فيديو.');
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'motion',
      title: input.title.slice(0, 120),
      prompt: input.title,
      spec: input as unknown as object,
      status: 'rendering',
      width: input.width,
      height: input.height,
      durationMs: Math.round(input.durationSec * 1000),
    },
  });

  const workDir = resolveStoragePath(`tmp/${asset.id}`);

  try {
    await mkdir(workDir, { recursive: true });

    const html = buildMotionHtml({
      template: input.template,
      palette: input.palette,
      title: input.title,
      ...(input.subtitle ? { subtitle: input.subtitle } : {}),
      durationSec: input.durationSec,
      width: input.width,
      height: input.height,
      fps: input.fps,
    });

    const totalFrames = Math.round(input.durationSec * input.fps);
    const started = Date.now();

    await renderFrames({
      html,
      width: input.width,
      height: input.height,
      frames: totalFrames,
      fps: input.fps,
      onFrame: async (index, image) => {
        await writeFile(join(workDir, `f${String(index).padStart(5, '0')}.png`), image);
      },
    });

    logger.debug(`رسمنا ${totalFrames} إطار في ${((Date.now() - started) / 1000).toFixed(1)} ثانية`);

    const relPath = `generated/${asset.id}.mp4`;
    await runFfmpeg([
      '-y',
      '-framerate', String(input.fps),
      '-i', join(workDir, 'f%05d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '18',
      // الأبعاد الفردية تكسر yuv420p
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags', '+faststart',
      resolveStoragePath(relPath),
    ]);

    // صورة مصغّرة من منتصف المقطع
    const thumbPath = `generated/${asset.id}-thumb.png`;
    const midFrame = join(workDir, `f${String(Math.floor(totalFrames / 2)).padStart(5, '0')}.png`);
    await writeFile(resolveStoragePath(thumbPath), await readFile(midFrame));

    const size = (await stat(resolveStoragePath(relPath))).size;

    return await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        path: relPath,
        thumbPath,
        mime: 'video/mp4',
        sizeBytes: size,
      },
    });
  } catch (error) {
    await markFailed(asset.id, error);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ───────────────────────── الفيديو من صور ─────────────────────────

export interface CreateSlideshowInput {
  title: string;
  /** معرّفات صور مولّدة سابقًا */
  imageIds: string[];
  /** مدة عرض كل صورة */
  secondsPerImage: number;
  /** تلاشي بين الصور */
  crossfade: boolean;
  fps: number;
}

export async function createSlideshow(input: CreateSlideshowInput): Promise<MediaAsset> {
  if (input.imageIds.length === 0) throw badRequest('اختر صورة وحدة على الأقل');
  if (input.imageIds.length > 40) throw badRequest('الحد 40 صورة');
  if (input.secondsPerImage < 0.5 || input.secondsPerImage > 15) {
    throw badRequest('مدة الصورة لازم بين نص ثانية و15 ثانية');
  }

  const ffmpeg = await checkFfmpeg();
  if (!ffmpeg.available) {
    throw new AppError(503, 'NO_FFMPEG', 'ما لقينا ffmpeg. ثبّته عشان تقدر تصدّر فيديو.');
  }

  const images = await prisma.mediaAsset.findMany({
    where: { id: { in: input.imageIds }, kind: 'image', status: 'ready' },
  });
  if (images.length === 0) throw badRequest('ما لقينا أي صورة جاهزة من اللي اخترتها');

  // نحافظ على ترتيب المستخدم
  const ordered = input.imageIds
    .map((id) => images.find((image) => image.id === id))
    .filter((image): image is MediaAsset => Boolean(image?.path));

  const width = ordered[0]?.width ?? 1080;
  const height = ordered[0]?.height ?? 1080;
  const totalMs = Math.round(ordered.length * input.secondsPerImage * 1000);

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: 'video',
      title: input.title.slice(0, 120) || 'عرض صور',
      prompt: input.title,
      spec: input as unknown as object,
      status: 'rendering',
      width,
      height,
      durationMs: totalMs,
    },
  });

  const workDir = resolveStoragePath(`tmp/${asset.id}`);

  try {
    await mkdir(workDir, { recursive: true });

    // قائمة تسلسل لـ ffmpeg
    const lines: string[] = [];
    for (const image of ordered) {
      const absolute = resolveStoragePath(image.path!);
      lines.push(`file '${absolute.replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${input.secondsPerImage}`);
    }
    // ffmpeg يحتاج آخر ملف مكررًا عشان يحترم مدته
    const last = ordered[ordered.length - 1];
    if (last?.path) {
      lines.push(`file '${resolveStoragePath(last.path).replace(/'/g, "'\\''")}'`);
    }

    const listPath = join(workDir, 'list.txt');
    await writeFile(listPath, lines.join('\n'), 'utf8');

    const relPath = `generated/${asset.id}.mp4`;
    const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${input.fps},format=yuv420p`;

    await runFfmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-vf', scale,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-movflags', '+faststart',
      resolveStoragePath(relPath),
    ]);

    const thumbPath = `generated/${asset.id}-thumb.png`;
    if (ordered[0]?.path) {
      await writeFile(
        resolveStoragePath(thumbPath),
        await readFile(resolveStoragePath(ordered[0].path)),
      );
    }

    const size = (await stat(resolveStoragePath(relPath))).size;

    return await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        path: relPath,
        thumbPath,
        mime: 'video/mp4',
        sizeBytes: size,
      },
    });
  } catch (error) {
    await markFailed(asset.id, error);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ───────────────────────── إدارة المخرجات ─────────────────────────

async function markFailed(id: string, error: unknown): Promise<void> {
  await prisma.mediaAsset
    .update({
      where: { id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 500) : 'خطأ غير معروف',
      },
    })
    .catch(() => undefined);
}

export type PublicAsset = Omit<MediaAsset, 'path' | 'thumbPath'> & {
  hasThumb: boolean;
};

/** يشيل مسارات التخزين قبل الإرسال للواجهة. */
export function toPublicAsset(asset: MediaAsset): PublicAsset {
  const { path: _p, thumbPath, ...rest } = asset;
  return { ...rest, hasThumb: Boolean(thumbPath) };
}

export async function listAssets(kind?: MediaKind): Promise<PublicAsset[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: kind ? { kind } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toPublicAsset);
}

export async function readAsset(
  id: string,
  variant: 'main' | 'thumb' = 'main',
): Promise<{ asset: MediaAsset; buffer: Buffer }> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw notFound('ما لقينا هذا الملف');

  const path = variant === 'thumb' ? asset.thumbPath : asset.path;
  if (!path) throw notFound('الملف لسا ما جهز');

  return { asset, buffer: await readFile(resolveStoragePath(path)) };
}

export async function deleteAsset(id: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw notFound('ما لقينا هذا الملف');

  if (asset.path) await removePath(asset.path).catch(() => undefined);
  if (asset.thumbPath) await removePath(asset.thumbPath).catch(() => undefined);
  await prisma.mediaAsset.delete({ where: { id } });
}
