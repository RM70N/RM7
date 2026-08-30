import { existsSync } from 'node:fs';
import type { Browser } from 'playwright-core';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { env } from '../lib/env.js';

/**
 * أنواع بيئة المتصفح — الكود اللي يمر لـ page.evaluate يشتغل داخل
 * الصفحة مو في نود، فنعرّف اللي نحتاجه بدل إدخال مكتبة DOM كاملة
 * على السيرفر.
 */
declare const document: { fonts: { ready: Promise<unknown> } };
declare const window: { seek?: (time: number) => void };

/**
 * محرك الرسم — يحوّل HTML/SVG إلى صور وإطارات.
 *
 * نستخدم متصفحًا بلا واجهة عشان النص العربي يتشكّل صح (تشابك الحروف
 * والاتجاه)، وهذا شي المكتبات الخفيفة تفشل فيه. كل الرسم محلي.
 */

/** أماكن شائعة لمتصفح كروميوم. */
const CHROMIUM_CANDIDATES = [
  env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

let browserInstance: Browser | null = null;
let launching: Promise<Browser> | null = null;

export function findChromium(): string | null {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export interface RendererInfo {
  available: boolean;
  executablePath: string | null;
  reason: string | null;
}

export function rendererInfo(): RendererInfo {
  const executablePath = findChromium();
  return {
    available: executablePath !== null,
    executablePath,
    reason: executablePath
      ? null
      : 'ما لقينا متصفح للرسم. ثبّت كروميوم أو حط مساره في CHROMIUM_PATH.',
  };
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance;
  if (launching) return launching;

  launching = (async () => {
    const executablePath = findChromium();
    if (!executablePath) {
      throw new AppError(
        503,
        'NO_RENDERER',
        'ما لقينا متصفح للرسم. ثبّت كروميوم أو حط مساره في CHROMIUM_PATH.',
      );
    }

    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });

    browserInstance = browser;
    logger.info('محرك الرسم جاهز');
    return browser;
  })();

  try {
    return await launching;
  } catch (error) {
    launching = null;
    throw error;
  }
}

export interface RenderOptions {
  html: string;
  width: number;
  height: number;
  /** 1 = عادي، 2 = دقة مضاعفة للطباعة */
  scale?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
  /** انتظار إضافي قبل اللقطة (للخطوط والأنيميشن) */
  waitMs?: number;
}

/** يرسم HTML كصورة. */
export async function renderToImage(options: RenderOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.scale ?? 1,
    // ما نسمح بأي طلب شبكة — الرسم محلي بالكامل
    offline: true,
  });

  try {
    const page = await context.newPage();
    await page.setContent(wrapHtml(options.html), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (options.waitMs) await page.waitForTimeout(options.waitMs);

    return await page.screenshot({
      type: options.format ?? 'png',
      ...(options.format === 'jpeg' ? { quality: options.quality ?? 92 } : {}),
    });
  } finally {
    await context.close();
  }
}

export interface FrameOptions {
  html: string;
  width: number;
  height: number;
  /** عدد الإطارات المطلوبة */
  frames: number;
  /** الإطارات في الثانية — نمرّرها للصفحة عشان تحسب توقيتها */
  fps: number;
  /** يُنادى مع كل إطار جاهز */
  onFrame: (index: number, image: Buffer) => Promise<void>;
}

/**
 * يرسم أنيميشن إطارًا بإطار.
 *
 * الصفحة لازم تعرّف دالة عامة اسمها seek(t) تستقبل الوقت بالثواني
 * وترسم الحالة عند تلك اللحظة — عشان الرندر يكون حتميًا مو معتمدًا
 * على ساعة حقيقية.
 */
export async function renderFrames(options: FrameOptions): Promise<void> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1,
    offline: true,
  });

  try {
    const page = await context.newPage();
    await page.setContent(wrapHtml(options.html), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const hasSeek = await page.evaluate(() => typeof window.seek === 'function');
    if (!hasSeek) {
      throw new AppError(
        400,
        'NO_SEEK',
        'قالب الأنيميشن لازم يعرّف دالة seek(t) عشان نرسم كل إطار بدقة.',
      );
    }

    for (let index = 0; index < options.frames; index += 1) {
      const time = index / options.fps;
      await page.evaluate((t) => {
        window.seek?.(t);
      }, time);
      await options.onFrame(index, await page.screenshot({ type: 'png' }));
    }
  } finally {
    await context.close();
  }
}

/** يلفّ المحتوى بصفحة كاملة بخطوط عربية وإعدادات ثابتة. */
function wrapHtml(inner: string): string {
  if (/<html[\s>]/i.test(inner)) return inner;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    font-family: "Noto Sans Arabic", "Noto Naskh Arabic", "KacstBook",
                 "DejaVu Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
</style>
</head>
<body>${inner}</body>
</html>`;
}

/** يطفي المتصفح — عند إطفاء السيرفر. */
export async function closeRenderer(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => undefined);
    browserInstance = null;
    launching = null;
  }
}
