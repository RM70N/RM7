/**
 * اختبارات انحدار أمنية — تتحقق أن الثغرات المُصلحة تبقى مغلقة.
 * التشغيل: شغّل npm run dev ثم: node tests/security.e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const API = 'http://localhost:4000';
const PW = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('OWNER_PASSWORD=')).slice('OWNER_PASSWORD='.length).trim();

let failures = 0;
const step = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext();
const page = await context.newPage();

// ── تسجيل دخول ──
await page.goto(`${API}/api/health`);
await page.request.post(`${API}/api/auth/login`, { data: { password: PW } });
const cookies = await context.cookies();
step('جلسة فعّالة للاختبار', cookies.some((c) => c.name === 'ahsmaha_session'));

// ── 1. المسارات المحمية ترفض بدون جلسة ──
const anon = await browser.newContext();
for (const path of ['/api/memory', '/api/keys', '/api/sites', '/api/studio', '/api/knowledge']) {
  const res = await anon.request.get(`${API}${path}`, { failOnStatusCode: false });
  step(`${path} يرفض بدون جلسة`, res.status() === 401, `HTTP ${res.status()}`);
}
await anon.close();

// ── 2. معاينة الموقع معزولة عن أصل النظام ──
// نبني موقعًا يحاول يسرق مفاتيح API من أصل النظام
const dir = mkdtempSync(join(tmpdir(), 'ahsmaha-sec-'));
const src = join(dir, 'evil');
mkdirSync(src, { recursive: true });
writeFileSync(
  join(src, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="out" data-stolen="pending">idle</div>
<script>
fetch('/api/keys', { credentials: 'same-origin' })
  .then((r) => r.json())
  .then((d) => {
    document.getElementById('out').dataset.stolen = 'yes';
    document.getElementById('out').textContent = JSON.stringify(d).slice(0, 60);
  })
  .catch((e) => {
    document.getElementById('out').dataset.stolen = 'no';
    document.getElementById('out').textContent = String(e.message);
  });
</script></body></html>`,
);
const zipPath = join(dir, 'evil.zip');
execSync(`cd "${src}" && zip -qr "${zipPath}" .`);

const upload = await page.request.post(`${API}/api/sites`, {
  multipart: {
    archive: { name: 'evil.zip', mimeType: 'application/zip', buffer: readFileSync(zipPath) },
    name: 'اختبار أمني',
  },
});
const projectId = (await upload.json()).project.id;

// الترويسة موجودة
const head = await page.request.get(`${API}/api/sites/${projectId}/preview/`);
const csp = head.headers()['content-security-policy'] ?? '';
step('المعاينة ترسل CSP sandbox', csp.includes('sandbox'), csp || '(غائبة)');

// الاختبار الحاسم: فتح المعاينة كتبويب رئيسي — بدون أي حماية من iframe
await page.goto(`${API}/api/sites/${projectId}/preview/`, { waitUntil: 'load' });
await page.waitForFunction(
  () => document.getElementById('out')?.dataset.stolen !== 'pending',
  { timeout: 15000 },
);
const stolen = await page.getAttribute('#out', 'data-stolen');
const shown = await page.textContent('#out');
step(
  'سكربت الموقع المرفوع ما يقدر يقرأ مفاتيح النظام',
  stolen === 'no',
  stolen === 'yes' ? `تسرّبت البيانات: ${shown}` : shown,
);

// تنظيف
await page.request.delete(`${API}/api/sites/${projectId}`);

// ── 3. حماية SSRF في جلب الصفحات ──
for (const url of [
  'http://169.254.169.254/latest/meta-data/',
  'http://127.0.0.1:4000/api/keys',
  'http://192.168.1.1/',
]) {
  const res = await page.request.get(
    `${API}/api/search/page?url=${encodeURIComponent(url)}`,
    { failOnStatusCode: false },
  );
  step(`SSRF مرفوض: ${new URL(url).hostname}`, res.status() === 400, `HTTP ${res.status()}`);
}

// ── 4. حماية zip-slip ──
// أرشيف فيه مسار يحاول يخرج من مجلد المشروع
const slipDir = mkdtempSync(join(tmpdir(), 'ahsmaha-slip-'));
const slipZip = join(slipDir, 'slip.zip');
execSync(
  `cd "${slipDir}" && mkdir -p a && echo ok > a/index.html && ` +
    `python3 -c "import zipfile; z=zipfile.ZipFile('${slipZip}','w'); ` +
    `z.writestr('index.html','ok'); z.writestr('../../../../tmp/ahsmaha-pwned.txt','x'); z.close()"`,
);
const slip = await page.request.post(`${API}/api/sites`, {
  multipart: {
    archive: { name: 'slip.zip', mimeType: 'application/zip', buffer: readFileSync(slipZip) },
    name: 'اختبار zip-slip',
  },
  failOnStatusCode: false,
});
step('أرشيف zip-slip مرفوض', slip.status() === 400, `HTTP ${slip.status()}`);

// ── 5. مفاتيح API: الصلاحيات مطبّقة ──
const issued = await page.request.post(`${API}/api/keys`, {
  data: { name: 'مفتاح اختبار أمني', scopes: ['chat'] },
});
const { secret, record } = await issued.json();

const allowed = await page.request.get(`${API}/api/v1/status`, {
  headers: { 'x-ahsmaha-key': secret },
  failOnStatusCode: false,
});
step('المفتاح يشتغل على صلاحيته', allowed.status() === 200, `HTTP ${allowed.status()}`);

const denied = await page.request.post(`${API}/api/v1/search`, {
  headers: { 'x-ahsmaha-key': secret },
  data: { query: 'x' },
  failOnStatusCode: false,
});
step('المفتاح يُرفض خارج صلاحيته', denied.status() === 403, `HTTP ${denied.status()}`);

await page.request.post(`${API}/api/keys/${record.id}/revoke`);
const revoked = await page.request.get(`${API}/api/v1/status`, {
  headers: { 'x-ahsmaha-key': secret },
  failOnStatusCode: false,
});
step('المفتاح الملغي يُرفض', revoked.status() === 401, `HTTP ${revoked.status()}`);
await page.request.delete(`${API}/api/keys/${record.id}`);

// ── 6. منع الفهرسة ──
const robots = await page.request.get(`${API}/robots.txt`);
step('robots.txt يمنع الزحف', (await robots.text()).includes('Disallow: /'));

const health = await page.request.get(`${API}/api/health`);
step(
  'ترويسة منع الفهرسة على كل استجابة',
  (health.headers()['x-robots-tag'] ?? '').includes('noindex'),
);

await browser.close();
console.log(`\n${failures === 0 ? 'كل الفحوص الأمنية نجحت' : `${failures} فحص أمني فشل`}`);
process.exit(failures === 0 ? 0 : 1);
