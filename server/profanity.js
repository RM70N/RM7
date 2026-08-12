// فلتر ألفاظ بسيط بالعربية والإنجليزية، قابل للتوسعة من لوحة التحكم
import { get as getStore } from './store.js';

const AR_BAD = ['كلب', 'حمار', 'غبي', 'حقير', 'لعنة', 'خنزير', 'قذر'];
const EN_BAD = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'idiot', 'stupid'];

function normalizeAr(s) {
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '');
}

function effectiveLists() {
  const store = getStore();
  const removed = new Set((store.profanityOverrides.removed || []).map((w) => w.toLowerCase()));
  const added = store.profanityOverrides.added || [];
  const ar = [...AR_BAD, ...added.filter((w) => /[؀-ۿ]/.test(w))].filter((w) => !removed.has(w.toLowerCase()));
  const en = [...EN_BAD, ...added.filter((w) => !/[؀-ۿ]/.test(w))].filter((w) => !removed.has(w.toLowerCase()));
  return { ar, en };
}

export function containsProfanity(text, strict = false) {
  const { ar, en } = effectiveLists();
  const lower = text.toLowerCase();
  const normAr = normalizeAr(text);
  for (const w of en) if (lower.includes(w.toLowerCase())) return true;
  for (const w of ar) if (normAr.includes(normalizeAr(w))) return true;
  if (strict && /https?:\/\//i.test(text)) return true;
  return false;
}

export function cleanText(text, strict = false) {
  if (!containsProfanity(text, strict)) return text;
  const { en } = effectiveLists();
  let out = text;
  for (const w of en) out = out.replace(new RegExp(w, 'ig'), '*'.repeat(w.length));
  return out;
}
