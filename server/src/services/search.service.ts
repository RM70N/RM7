import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { badRequest } from '../lib/errors.js';

/**
 * البحث الحي على الإنترنت.
 *
 * ما نستخدم أي API مدفوع ولا أي مزود ذكاء اصطناعي — نستعلم محرك بحث
 * مباشرة ونقرأ الصفحات بأنفسنا. المزوّد قابل للتبديل من الإعدادات،
 * ويفضّل SearxNG لو عندك واحد مستضاف عندك.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_PAGE_CHARS = 12_000;

/** جلب مع مهلة — ما نعلّق على موقع بطيء. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ar,en;q=0.8',
        ...(init.headers ?? {}),
      },
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** يفك ترميز كيانات HTML الشائعة. */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  };

  return text
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

/** يشيل وسوم HTML ويطلع نصًا نظيفًا. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      // نشيل المحتوى غير المقروء كليًا
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // الفواصل الكتلية تصير أسطر
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    // نشيل الأسطر اللي ما فيها إلا فراغ — صفحات كثيرة تطلع مليانة فيها
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** يطلع عنوان الصفحة. */
export function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

// ───────────────────────── محركات البحث ─────────────────────────

/**
 * يحلّل صفحة نتائج DuckDuckGo النصية (html.duckduckgo.com).
 * منفصلة عن الشبكة عشان تكون قابلة للاختبار.
 */
export function parseDuckDuckGo(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];

  // كل نتيجة: رابط بصنف result__a، ثم مقتطف بصنف result__snippet
  const blockPattern =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|<\/div>\s*<\/div>\s*<\/div>|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null && results.length < limit) {
    const rawUrl = match[1] ?? '';
    const title = htmlToText(match[2] ?? '').slice(0, 300);
    const tail = match[3] ?? '';

    const snippetMatch = tail.match(
      /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippet = htmlToText(snippetMatch?.[1] ?? '').slice(0, 500);

    const url = normalizeDuckDuckGoUrl(rawUrl);
    if (!url || !title) continue;
    if (results.some((r) => r.url === url)) continue;

    results.push({ title, url, snippet });
  }

  return results;
}

/** روابط DuckDuckGo تجي ملفوفة بـ /l/?uddg=… — نفكّها. */
export function normalizeDuckDuckGoUrl(raw: string): string | null {
  let url = decodeEntities(raw.trim());
  if (url.startsWith('//')) url = `https:${url}`;

  const wrapped = url.match(/[?&]uddg=([^&]+)/);
  if (wrapped?.[1]) {
    try {
      url = decodeURIComponent(wrapped[1]);
    } catch {
      return null;
    }
  }

  if (!/^https?:\/\//i.test(url)) return null;
  // نستبعد روابط المحرك نفسه
  if (/duckduckgo\.com\/(y\.js|l\/)/i.test(url)) return null;
  return url;
}

/** يحلّل رد SearxNG بصيغة JSON. */
export function parseSearxng(payload: unknown, limit: number): SearchResult[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  const output: SearchResult[] = [];
  for (const item of results) {
    if (output.length >= limit) break;
    if (typeof item !== 'object' || item === null) continue;

    const record = item as Record<string, unknown>;
    const url = typeof record.url === 'string' ? record.url : '';
    const title = typeof record.title === 'string' ? record.title : '';
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;

    output.push({
      title: title.slice(0, 300),
      url,
      snippet: (typeof record.content === 'string' ? record.content : '').slice(0, 500),
    });
  }

  return output;
}

/** يبحث في الإنترنت ويرجّع النتائج. */
export async function search(query: string, limit = 6): Promise<SearchResult[]> {
  const clean = query.trim();
  if (!clean) throw badRequest('اكتب وش تدوّر عليه');

  // SearxNG المستضاف عندك أولًا لو مضبوط
  if (env.SEARXNG_URL) {
    try {
      const url = new URL('/search', env.SEARXNG_URL);
      url.searchParams.set('q', clean);
      url.searchParams.set('format', 'json');
      url.searchParams.set('language', 'ar');

      const response = await fetchWithTimeout(url.toString());
      if (response.ok) {
        const results = parseSearxng(await response.json(), limit);
        if (results.length > 0) return results;
      }
      logger.warn(`SearxNG رد بـ ${response.status} — نجرب المحرك الاحتياطي`);
    } catch (error) {
      logger.warn('تعذّر الوصول لـ SearxNG — نجرب المحرك الاحتياطي', error);
    }
  }

  // DuckDuckGo بدون مفتاح
  try {
    const response = await fetchWithTimeout('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: clean, kl: 'xa-ar' }).toString(),
    });

    if (!response.ok) {
      throw new Error(`محرك البحث رد بـ ${response.status}`);
    }
    return parseDuckDuckGo(await response.text(), limit);
  } catch (error) {
    logger.warn('فشل البحث', error);
    throw badRequest(
      'ما قدرنا نوصل لمحرك البحث. تأكد أن السيرفر يوصل للإنترنت، أو اضبط SEARXNG_URL.',
    );
  }
}

/** يجيب صفحة ويطلع نصها المقروء. */
export async function fetchPage(url: string): Promise<PageContent> {
  if (!/^https?:\/\//i.test(url)) throw badRequest('رابط غير صالح');

  // نمنع الوصول للشبكة الداخلية (SSRF)
  const parsed = new URL(url);
  if (isPrivateHost(parsed.hostname)) {
    throw badRequest('ما نقدر نجيب صفحات من الشبكة الداخلية');
  }

  const response = await fetchWithTimeout(url);
  if (!response.ok) throw badRequest(`الصفحة ردت بـ ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
    throw badRequest('هذا الرابط مو صفحة نصية');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const html = buffer.subarray(0, MAX_PAGE_BYTES).toString('utf8');

  const text = htmlToText(html);
  const truncated = text.length > MAX_PAGE_CHARS;

  return {
    url,
    title: extractTitle(html) || parsed.hostname,
    text: truncated ? `${text.slice(0, MAX_PAGE_CHARS)}…` : text,
    truncated,
  };
}

/** يمنع طلبات الشبكة الداخلية. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    const [a, b] = parts as [number, number, number, number];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }
  return false;
}

// ───────────────────────── متى نبحث تلقائيًا ─────────────────────────

/** كلمات تدل على أن السؤال يحتاج معلومة محدثة. */
const FRESH_MARKERS = [
  'اليوم', 'الحين', 'الان', 'حاليا', 'آخر', 'اخر', 'جديد', 'أحدث', 'احدث',
  'الجديد', 'مؤخرا', 'موخرا', 'هذا الاسبوع', 'هذا الشهر', 'هذي السنة',
  'سعر', 'أسعار', 'اسعار', 'تكلفة', 'كم يكلف',
  'أخبار', 'اخبار', 'خبر', 'حدث', 'نتيجة', 'نتائج',
  'الطقس', 'الجو', 'درجة الحرارة',
  'إصدار', 'اصدار', 'نسخة', 'تحديث',
  'من فاز', 'من هو الحالي', 'وش صار',
  'ابحث', 'دور لي', 'دوّر لي', 'شوف لي بالنت',
];

/**
 * يقرّر هل السؤال يستاهل بحثًا حيًا.
 * محافظ عمدًا — البحث يكلّف وقتًا، فما نسويه إلا لما يبين أنه يفيد.
 */
export function needsSearch(question: string): boolean {
  const normalized = question
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .toLowerCase();

  if (FRESH_MARKERS.some((marker) => normalized.includes(marker.replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي')))) {
    return true;
  }

  // سنة حالية أو قادمة في السؤال
  const year = new Date().getFullYear();
  if (new RegExp(`\\b(${year}|${year + 1})\\b`).test(normalized)) return true;

  return false;
}

/** يجهّز نتائج البحث كنص للحقن في برومبت النظام، مع المصادر. */
export async function searchContext(
  query: string,
  options: { limit?: number; fetchPages?: number } = {},
): Promise<{ text: string; sources: SearchResult[] } | null> {
  const limit = options.limit ?? 5;
  const fetchCount = options.fetchPages ?? 2;

  let results: SearchResult[];
  try {
    results = await search(query, limit);
  } catch (error) {
    logger.debug('تخطّينا البحث الحي', error);
    return null;
  }
  if (results.length === 0) return null;

  const parts: string[] = [];

  results.forEach((result, index) => {
    parts.push(`[${index + 1}] ${result.title}\n    ${result.url}\n    ${result.snippet}`);
  });

  // نقرأ أول صفحتين بالتفصيل عشان الإجابة تكون دقيقة
  for (const result of results.slice(0, fetchCount)) {
    try {
      const page = await fetchPage(result.url);
      parts.push(`\nمحتوى [${results.indexOf(result) + 1}] ${page.title}:\n${page.text.slice(0, 4000)}`);
    } catch {
      // صفحة ما انقرأت — نكمل بالمقتطف
    }
  }

  return { text: parts.join('\n\n'), sources: results };
}
