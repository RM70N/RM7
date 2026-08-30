/**
 * سجل النماذج المدعومة في محرك احسمها.
 * كلها أوزان مفتوحة المصدر تُنزَّل مرة وحدة وتشتغل على سيرفرك — بدون أي API خارجي.
 */

export interface ModelEntry {
  /** معرّف قصير نستخدمه في الإعدادات والأوامر */
  id: string;
  /** الاسم المعروض */
  label: string;
  /** وصف مختصر بالعربي */
  note: string;
  /** مستودع الأوزان (HuggingFace) */
  repo: string;
  /** اسم ملف GGUF داخل المستودع */
  file: string;
  /** حجم التحميل التقريبي بالغيغابايت */
  sizeGb: number;
  /** أقل رام مطلوبة بالغيغابايت */
  minRamGb: number;
  /** قوة اللهجة السعودية: 1 ضعيف — 5 ممتاز */
  saudi: number;
}

export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'allam-7b',
    label: 'ALLaM 7B (سعودي)',
    note: 'نموذج سعودي من سدايا، الأقوى في العربية واللهجة الخليجية. الخيار المفضّل لاحسمها.',
    repo: 'bartowski/ALLaM-AI_ALLaM-7B-Instruct-preview-GGUF',
    file: 'ALLaM-AI_ALLaM-7B-Instruct-preview-Q4_K_M.gguf',
    sizeGb: 4.4,
    minRamGb: 8,
    saudi: 5,
  },
  {
    id: 'allam-7b-hq',
    label: 'ALLaM 7B — جودة أعلى',
    note: 'نفس النموذج بضغط أخف (Q6). أدق بس يبي رام أكثر.',
    repo: 'bartowski/ALLaM-AI_ALLaM-7B-Instruct-preview-GGUF',
    file: 'ALLaM-AI_ALLaM-7B-Instruct-preview-Q6_K.gguf',
    sizeGb: 6.2,
    minRamGb: 10,
    saudi: 5,
  },
  {
    id: 'qwen3-8b',
    label: 'Qwen3 8B',
    note: 'متعدد اللغات وقوي في البرمجة والتحليل. عربيته زينة بس أقل سعودية من ALLaM.',
    repo: 'Qwen/Qwen3-8B-GGUF',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    sizeGb: 5.0,
    minRamGb: 9,
    saudi: 3,
  },
  {
    id: 'qwen3-4b',
    label: 'Qwen3 4B (خفيف)',
    note: 'للسيرفرات المتوسطة. أسرع بمرتين من 8B بس أقل ذكاءً.',
    repo: 'Qwen/Qwen3-4B-GGUF',
    file: 'Qwen3-4B-Q4_K_M.gguf',
    sizeGb: 2.5,
    minRamGb: 6,
    saudi: 3,
  },
  {
    id: 'qwen3-1.7b',
    label: 'Qwen3 1.7B (خفيف جدًا)',
    note: 'يشتغل على سيرفر بـ 4 غيغا رام. مناسب للردود القصيرة والأسئلة البسيطة.',
    repo: 'Qwen/Qwen3-1.7B-GGUF',
    file: 'Qwen3-1.7B-Q4_K_M.gguf',
    sizeGb: 1.1,
    minRamGb: 4,
    saudi: 2,
  },
  {
    id: 'qwen3-0.6b',
    label: 'Qwen3 0.6B (أصغر شي)',
    note: 'آخر حل للسيرفرات الصغيرة جدًا (2 غيغا). ردوده بسيطة وأخطاؤه أكثر.',
    repo: 'Qwen/Qwen3-0.6B-GGUF',
    file: 'Qwen3-0.6B-Q4_K_M.gguf',
    sizeGb: 0.5,
    minRamGb: 2,
    saudi: 1,
  },
];

/**
 * يختار أنسب نموذج للرام المتاحة.
 * نترك هامشًا لقاعدة البيانات والسيرفر ومحرك الرسم.
 */
export function recommendModel(availableRamGb: number): ModelEntry {
  const fits = MODEL_CATALOG.filter((entry) => entry.minRamGb <= availableRamGb);
  if (fits.length === 0) return MODEL_CATALOG[MODEL_CATALOG.length - 1]!;

  // الأفضل = أعلى جودة لهجة، ثم أكبر حجم يدخل في الرام
  return fits.sort((a, b) => b.saudi - a.saudi || b.sizeGb - a.sizeGb)[0]!;
}

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((entry) => entry.id === id);
}

/** رابط التحميل المباشر للأوزان. */
export function downloadUrl(entry: ModelEntry): string {
  return `https://huggingface.co/${entry.repo}/resolve/main/${entry.file}?download=true`;
}
