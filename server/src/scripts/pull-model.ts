import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { MODEL_CATALOG, downloadUrl, findModel, type ModelEntry } from '../engine/catalog.js';
import { modelsDir } from '../engine/runtime.js';

/**
 * ينزّل أوزان محرك احسمها.
 *
 *   npm run engine:pull -w server              # النموذج المفضّل (ALLaM السعودي)
 *   npm run engine:pull -w server -- qwen3-4b  # نموذج محدد
 *   npm run engine:pull -w server -- --list    # عرض المتاح
 *
 * يدعم استئناف التحميل إذا انقطع.
 */

const out = (line = '') => process.stdout.write(line + '\n');

function humanBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} غيغا`;
  return `${(bytes / 1024 ** 2).toFixed(1)} ميغا`;
}

function printCatalog(): void {
  out('\nالنماذج المتاحة لمحرك احسمها:\n');
  for (const entry of MODEL_CATALOG) {
    const stars = '★'.repeat(entry.saudi) + '☆'.repeat(5 - entry.saudi);
    out(`  ${entry.id}`);
    out(`     ${entry.label} — ${entry.sizeGb} غيغا — يحتاج ${entry.minRamGb} غيغا رام`);
    out(`     سعودية اللهجة: ${stars}`);
    out(`     ${entry.note}`);
    out('');
  }
  out('التحميل:  npm run engine:pull -w server -- <المعرّف>\n');
}

async function download(entry: ModelEntry): Promise<void> {
  const dir = modelsDir();
  await mkdir(dir, { recursive: true });

  const target = join(dir, entry.file);
  const partial = `${target}.part`;

  try {
    const existing = await stat(target);
    out(`\nالأوزان موجودة أصلًا: ${target} (${humanBytes(existing.size)})`);
    out('لو تبي تعيد التحميل، احذف الملف وأعد الأمر.\n');
    return;
  } catch {
    // مو موجود — نكمل التحميل
  }

  let resumeFrom = 0;
  try {
    resumeFrom = (await stat(partial)).size;
    if (resumeFrom > 0) out(`نكمّل تحميل سابق من ${humanBytes(resumeFrom)}…`);
  } catch {
    resumeFrom = 0;
  }

  const url = downloadUrl(entry);
  out(`\nننزّل: ${entry.label}`);
  out(`المصدر: ${entry.repo}`);
  out(`الحجم التقريبي: ${entry.sizeGb} غيغا\n`);

  const response = await fetch(url, {
    headers: resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {},
    redirect: 'follow',
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(
      `فشل التحميل (HTTP ${response.status}). تأكد أن الجهاز يوصل لـ huggingface.co`,
    );
  }
  if (!response.body) throw new Error('ما وصلنا أي بيانات من المصدر');

  const total = Number(response.headers.get('content-length') ?? 0) + resumeFrom;
  let received = resumeFrom;
  let lastPrint = 0;

  const source = Readable.fromWeb(response.body as never);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    const now = Date.now();
    if (now - lastPrint > 1000) {
      lastPrint = now;
      const pct = total > 0 ? ((received / total) * 100).toFixed(1) : '?';
      process.stdout.write(`\r  ${pct}%  —  ${humanBytes(received)}${' '.repeat(12)}`);
    }
  });

  await pipeline(
    source,
    createWriteStream(partial, { flags: resumeFrom > 0 ? 'a' : 'w' }),
  );

  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  await rename(partial, target);

  const final = await stat(target);
  out(`تم — ${target} (${humanBytes(final.size)})`);
  out('\nشغّل السيرفر والمحرك بيلقاها تلقائيًا.\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');

  if (args.includes('--list') || args.includes('-l')) {
    printCatalog();
    return;
  }

  const requested = args[0] ?? MODEL_CATALOG[0]!.id;
  const entry = findModel(requested);

  if (!entry) {
    out(`\nما لقينا نموذج اسمه "${requested}".`);
    printCatalog();
    process.exitCode = 1;
    return;
  }

  try {
    await download(entry);
  } catch (error) {
    out(`\nفشل التحميل: ${error instanceof Error ? error.message : String(error)}`);
    await unlink(join(modelsDir(), `${entry.file}.part`)).catch(() => undefined);
    process.exitCode = 1;
  }
}

void main();
