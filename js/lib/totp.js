/* ==========================================================================
   TOTP (RFC 6238) — مصادقة ثنائية عبر تطبيق Authenticator.
   يعمل بالكامل داخل المتصفح عبر Web Crypto (HMAC-SHA1). لا يرسل أي سرّ لأي جهة.
   ========================================================================== */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** يولّد سرّ Base32 عشوائي (افتراضي 32 حرفاً = 160 بت). */
export function generateSecret(len = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += B32[b % 32];
  return out;
}

function base32ToBytes(s) {
  const clean = s.toUpperCase().replace(/=+$/,"").replace(/\s/g,"");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function hmacSha1(keyBytes, msgBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  return new Uint8Array(sig);
}

/** يحسب كود TOTP لسرّ معيّن في لحظة زمنية (بالثواني). */
export async function totpAt(secret, forSeconds, { step = 30, digits = 6 } = {}) {
  const counter = Math.floor(forSeconds / step);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const h = await hmacSha1(base32ToBytes(secret), msg);
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

/** الكود الحالي. */
export function totpNow(secret, opts) { return totpAt(secret, Date.now() / 1000, opts); }

/** يتحقق من كود المستخدم مع نافذة تسامح ±1 خطوة (لفروقات الساعة). */
export async function verifyToken(secret, token, { window = 1, step = 30, digits = 6 } = {}) {
  const t = String(token || "").replace(/\D/g, "");
  if (t.length !== digits) return false;
  const now = Date.now() / 1000;
  for (let w = -window; w <= window; w++) {
    if (await totpAt(secret, now + w * step, { step, digits }) === t) return true;
  }
  return false;
}

/** رابط otpauth:// لإضافته في تطبيق Authenticator (أو توليد QR منه). */
export function otpauthURL(secret, account = "MZX", issuer = "ادمن احسمها") {
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params}`;
}
