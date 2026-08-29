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
    note: 'للأجهزة الضعيفة. أسرع بمرتين بس أقل ذكاءً.',
    repo: 'Qwen/Qwen3-4B-GGUF',
    file: 'Qwen3-4B-Q4_K_M.gguf',
    sizeGb: 2.5,
    minRamGb: 6,
    saudi: 3,
  },
];

export function findModel(id: string): ModelEntry | undefined {
  return MODEL_CATALOG.find((entry) => entry.id === id);
}

/** رابط التحميل المباشر للأوزان. */
export function downloadUrl(entry: ModelEntry): string {
  return `https://huggingface.co/${entry.repo}/resolve/main/${entry.file}?download=true`;
}
