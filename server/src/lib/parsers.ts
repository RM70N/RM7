import { logger } from './logger.js';
import { badRequest } from './errors.js';

/**
 * استخراج النص من الملفات المرفوعة.
 * كل القراءة تتم محليًا — ما نرسل أي ملف لأي خدمة خارجية.
 */

export interface ParsedDocument {
  text: string;
  pageCount?: number;
  /** معلومات إضافية حسب نوع الملف (أوراق إكسل، ثقة OCR…) */
  meta?: Record<string, unknown>;
}

export const SUPPORTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'text/csv': 'CSV',
  'text/plain': 'نص',
  'text/markdown': 'ماركداون',
  'application/json': 'JSON',
  'image/png': 'صورة',
  'image/jpeg': 'صورة',
  'image/webp': 'صورة',
};

export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function isSupported(mime: string): boolean {
  return mime in SUPPORTED_TYPES;
}

export function typeLabel(mime: string): string {
  return SUPPORTED_TYPES[mime] ?? 'ملف';
}

/** محارف غير مرئية تتسرب من ملفات PDF وWord وتشوّش النص. */
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/** ينظّف النص المستخرج: يوحّد الأسطر ويشيل الفراغات والمحارف الزايدة. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(INVISIBLE_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      text: cleanText(result.text),
      pageCount: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

async function parseWord(buffer: Buffer): Promise<ParsedDocument> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  if (result.messages.length > 0) {
    logger.debug(`ملاحظات قراءة Word: ${result.messages.length}`);
  }
  return { text: cleanText(result.value) };
}

async function parseExcel(buffer: Buffer): Promise<ParsedDocument> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`## ورقة: ${sheetName}\n${csv.trim()}`);
  }

  return {
    text: cleanText(parts.join('\n\n')),
    meta: { sheets: workbook.SheetNames },
  };
}

async function parseCsv(buffer: Buffer): Promise<ParsedDocument> {
  const { parse } = await import('csv-parse/sync');
  const rows = parse(buffer.toString('utf8'), {
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as string[][];

  const text = rows.map((row) => row.join(' | ')).join('\n');
  return {
    text: cleanText(text),
    meta: { rows: rows.length, columns: rows[0]?.length ?? 0 },
  };
}

async function parseImage(buffer: Buffer): Promise<ParsedDocument> {
  // نقرأ النص من الصورة بـ OCR محلي (عربي + إنجليزي)
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(['ara', 'eng']);
    try {
      const { data } = await worker.recognize(buffer);
      const text = cleanText(data.text ?? '');
      return {
        text,
        meta: {
          ocr: true,
          confidence: data.confidence ?? null,
          empty: text.length === 0,
        },
      };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    logger.warn('تعذّر تشغيل قراءة الصور (OCR)', error);
    return {
      text: '',
      meta: { ocr: false, error: 'ما قدرنا نقرأ النص من الصورة' },
    };
  }
}

function parsePlainText(buffer: Buffer): ParsedDocument {
  return { text: cleanText(buffer.toString('utf8')) };
}

/** يستخرج النص من أي ملف مدعوم. */
export async function parseDocument(buffer: Buffer, mime: string): Promise<ParsedDocument> {
  if (!isSupported(mime)) {
    throw badRequest(
      `نوع الملف ${mime} مو مدعوم. المدعوم: PDF، Word، Excel، CSV، نص، وصور.`,
    );
  }

  switch (mime) {
    case 'application/pdf':
      return parsePdf(buffer);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return parseWord(buffer);

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel':
      return parseExcel(buffer);

    case 'text/csv':
      return parseCsv(buffer);

    default:
      return IMAGE_TYPES.has(mime) ? parseImage(buffer) : parsePlainText(buffer);
  }
}

// ───────────────────────── التقطيع للفهرسة ─────────────────────────

export interface TextChunk {
  content: string;
  ordinal: number;
}

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

/**
 * يقسّم النص لمقاطع متداخلة.
 * يحاول يقطع عند حدود الفقرات والجمل عشان ما يكسر المعنى.
 */
export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): TextChunk[] {
  const clean = cleanText(text);
  if (!clean) return [];
  if (clean.length <= size) return [{ content: clean, ordinal: 0 }];

  // تداخل أكبر من نصف المقطع يخلي كل خطوة تتقدّم حرفًا واحدًا،
  // فيطلع مقطع لكل حرف. نحدّه بنصف الحجم.
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(size / 2)));

  const chunks: TextChunk[] = [];
  const searchFrom = Math.floor(size * 0.7);
  let start = 0;
  let ordinal = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);

    // ندوّر على أفضل نقطة قطع في آخر 30% من المقطع
    if (end < clean.length) {
      const window = clean.slice(start + searchFrom, end);
      const breakers = ['\n\n', '\n', '. ', '، ', '؟ ', '! ', ' '];

      for (const breaker of breakers) {
        const index = window.lastIndexOf(breaker);
        if (index > 0) {
          end = start + searchFrom + index + breaker.length;
          break;
        }
      }
    }

    const content = clean.slice(start, end).trim();
    if (content) {
      chunks.push({ content, ordinal });
      ordinal += 1;
    }

    if (end >= clean.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }

  return chunks;
}
