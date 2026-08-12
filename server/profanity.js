// فلتر ألفاظ بسيط بالعربية والإنجليزية. قابل للتوسعة من لوحة التحكم لاحقًا.
// ملاحظة: قائمة مبدئية محافظة؛ الهدف منع الألفاظ الصريحة لا الرقابة الكاملة.
const AR_BAD = ['كلب', 'حمار', 'غبي', 'حقير', 'لعنة', 'خنزير', 'قذر'];
const EN_BAD = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'idiot', 'stupid'];

function normalizeAr(s) {
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '');
}

export function containsProfanity(text, strict = false) {
  const lower = text.toLowerCase();
  const normAr = normalizeAr(text);
  for (const w of EN_BAD) {
    if (lower.includes(w)) return true;
  }
  for (const w of AR_BAD) {
    if (normAr.includes(normalizeAr(w))) return true;
  }
  if (strict) {
    // في الوضع العائلي نمنع أيضًا أي روابط أو محتوى مشبوه
    if (/https?:\/\//i.test(text)) return true;
  }
  return false;
}

export function cleanText(text, strict = false) {
  if (!containsProfanity(text, strict)) return text;
  // استبدال الكلمات المسيئة بنجوم
  let out = text;
  const all = [...EN_BAD];
  for (const w of all) {
    out = out.replace(new RegExp(w, 'ig'), '*'.repeat(w.length));
  }
  return out;
}
