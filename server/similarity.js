// مقارنة تشابه نصّي بسيطة (تستخدمها وحدة نمط "بالنقاط")
function normalize(text) {
  return (text || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[^؀-ۿa-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim();
}

const STOPWORDS = new Set(['في', 'من', 'على', 'الى', 'إلى', 'و', 'مع', 'عن', 'هذا', 'هذه', 'ذلك', 'كان', 'يكون', 'ال']);

export function wordSet(text) {
  return new Set(
    normalize(text)
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

// معامل جاكارد بين مجموعتي كلمات (0 = لا تشابه، 1 = تطابق تام)
export function similarity(a, b) {
  const sa = wordSet(a);
  const sb = wordSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const SIMILARITY_THRESHOLD = 0.2;
