import { generate } from '../engine/inference.js';
import { logger } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';
import {
  applyEdits,
  getProject,
  siteContextText,
  type AppliedChange,
  type FileEdit,
} from './site.service.js';

/**
 * تعديل المواقع المرفوعة عبر محرك احسمها.
 *
 * المحرك يرد بكتل ملفات بصيغة صارمة، ونحن نحللها ونطبّقها بأمان
 * مع نسخة احتياطية قابلة للرجوع.
 */

export const EDIT_PROMPT = `أنت تعدّل على موقع ويب مرفوع. اقرأ بنية الموقع وملفاته تحت، ونفّذ طلب صاحبك.

قواعد صارمة:
1. لا تكسر أي وظيفة موجودة. إذا كان التعديل يكسر شي، عدّل بطريقة ثانية.
2. اكتب الملف كامل من أوله لآخره — مو مقتطفات ولا "…الباقي كما هو".
3. عدّل الملفات اللي تحتاج تعديل بس. لا تلمس اللي ما لها علاقة.
4. حافظ على أسلوب الكود الموجود (المسافات، التسمية، اللغة).

صيغة الرد — التزم فيها حرفيًا:

### ملخص
سطر أو سطرين بالسعودي تشرح وش سويت.

### الملفات
<<<FILE: المسار/الملف.html>>>
محتوى الملف كامل هنا
<<<END>>>

<<<FILE: style.css>>>
محتوى الملف كامل هنا
<<<END>>>

لحذف ملف:
<<<DELETE: المسار/الملف.js>>>

إذا الطلب ما يحتاج أي تعديل، اكتب "### ملخص" وبعدها السبب، وبدون أي كتلة ملفات.`;

export interface ParsedEdits {
  summary: string;
  edits: FileEdit[];
}

/**
 * يحلّل رد المحرك ويطلع منه التعديلات.
 * متسامح مع اختلاف المسافات وتغليف الماركداون.
 */
export function parseEditResponse(raw: string): ParsedEdits {
  const text = raw.replace(/\r\n/g, '\n');

  // الملخص: كل شي بين "### ملخص" وأول كتلة ملف
  let summary = '';
  const summaryMatch = text.match(/###\s*ملخص\s*\n([\s\S]*?)(?=<<<|###\s*الملفات|$)/);
  if (summaryMatch?.[1]) {
    summary = summaryMatch[1].replace(/###\s*الملفات\s*/g, '').trim();
  }

  const edits: FileEdit[] = [];

  // كتل الملفات
  const fileBlock = /<<<FILE:\s*(.+?)\s*>>>\n?([\s\S]*?)<<<END>>>/g;
  let match: RegExpExecArray | null;

  while ((match = fileBlock.exec(text)) !== null) {
    const relPath = match[1]?.trim();
    let content = match[2] ?? '';
    if (!relPath) continue;

    // نشيل تغليف الماركداون لو المحرك حطه
    content = content.replace(/^```[\w-]*\n/, '').replace(/\n```\s*$/, '');
    // نشيل سطرًا فاضيًا زايدًا في الآخر بس
    content = content.replace(/\n+$/, '\n');

    edits.push({ relPath, action: 'update', content });
  }

  // كتل الحذف
  const deleteBlock = /<<<DELETE:\s*(.+?)\s*>>>/g;
  while ((match = deleteBlock.exec(text)) !== null) {
    const relPath = match[1]?.trim();
    if (relPath) edits.push({ relPath, action: 'delete' });
  }

  if (!summary) {
    summary = edits.length > 0 ? `تعديل ${edits.length} ملف` : 'ما فيه تعديل';
  }

  return { summary, edits };
}

export interface EditResult {
  summary: string;
  changes: AppliedChange[];
  revisionId: string | null;
  /** رد المحرك الخام — للعرض إذا ما طلع منه تعديلات */
  raw: string;
}

/**
 * يطلب من المحرك يعدّل الموقع، ويطبّق التعديلات.
 */
export async function editSite(
  projectId: string,
  instruction: string,
  onChunk?: (text: string) => void,
): Promise<EditResult> {
  const project = await getProject(projectId);
  if (project.status !== 'ready') {
    throw badRequest('المشروع لسا ما جهز');
  }

  const context = await siteContextText(projectId);

  const result = await generate({
    prompt: `${EDIT_PROMPT}\n\n---\n\n${context}\n\n---\n\nطلب صاحبك: ${instruction}`,
    // بدون شخصية المحادثة — هذي مهمة تعديل كود
    context: {},
    temperature: 0.2,
    maxTokens: 8000,
    ...(onChunk ? { onChunk } : {}),
  });

  const { summary, edits } = parseEditResponse(result.text);

  if (edits.length === 0) {
    return { summary, changes: [], revisionId: null, raw: result.text };
  }

  try {
    const applied = await applyEdits(projectId, edits, summary);
    logger.info(`عدّلنا موقع "${project.name}" — ${applied.changes.length} ملف`);
    return {
      summary,
      changes: applied.changes,
      revisionId: applied.revisionId,
      raw: result.text,
    };
  } catch (error) {
    logger.error('فشل تطبيق تعديلات الموقع', error);
    throw error;
  }
}

/** يبني فرقًا مقروءًا سطرًا بسطر للعرض. */
export interface DiffLine {
  kind: 'same' | 'add' | 'remove';
  text: string;
}

export function buildDiff(before: string | null, after: string | null): DiffLine[] {
  const beforeLines = before === null ? [] : before.split('\n');
  const afterLines = after === null ? [] : after.split('\n');

  // فرق بسيط بأطول تسلسل مشترك — كافٍ لعرض التغييرات
  const lcs: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    new Array<number>(afterLines.length + 1).fill(0),
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        beforeLines[i] === afterLines[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ kind: 'same', text: beforeLines[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      lines.push({ kind: 'remove', text: beforeLines[i]! });
      i += 1;
    } else {
      lines.push({ kind: 'add', text: afterLines[j]! });
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    lines.push({ kind: 'remove', text: beforeLines[i]! });
    i += 1;
  }
  while (j < afterLines.length) {
    lines.push({ kind: 'add', text: afterLines[j]! });
    j += 1;
  }

  return lines;
}

/** إحصائيات الفرق — كم سطر انضاف وكم انشال. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'remove').length,
  };
}
