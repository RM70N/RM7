/**
 * اختبار صفحة المواقع المرفوعة عبر متصفح حقيقي.
 * التشغيل: شغّل npm run dev ثم: node tests/sites.e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PW = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('OWNER_PASSWORD=')).slice('OWNER_PASSWORD='.length).trim();

// نبني أرشيف موقع للاختبار
const dir = mkdtempSync(join(tmpdir(), 'ahsmaha-site-'));
const src = join(dir, 'src');
mkdirSync(join(src, 'css'), { recursive: true });
writeFileSync(
  join(src, 'index.html'),
  '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<title>موقع الاختبار</title><link rel="stylesheet" href="css/main.css"></head>' +
    '<body><h1 id="title">مرحبا من الاختبار</h1></body></html>',
);
writeFileSync(join(src, 'css', 'main.css'), 'body { background: #fff; color: #111; }\n');
const zipPath = join(dir, 'test-site.zip');
execSync(`cd "${src}" && zip -qr "${zipPath}" .`);

const problems = [];
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

// نراقب ملفات المعاينة: الإطار المعزول أصله معتم، فلو رجعنا لكوكي
// الجلسة بدل رمز المعاينة تنحجب ملفات الموقع ويطلع التنسيق مكسورًا.
const previewAssets = [];
page.on('response', (r) => {
  if (r.url().includes('/preview/')) previewAssets.push({ url: r.url(), status: r.status() });
});
const previewFailures = [];
page.on('requestfailed', (r) => {
  const reason = r.failure()?.errorText ?? '';
  // ERR_ABORTED طبيعي: الإطار ينستبدل بعد كل تعديل فينقطع تحميله.
  // اللي يهمنا الحجب الفعلي (ORB/CORS) اللي يكسر ملفات الموقع.
  if (r.url().includes('/preview/') && !reason.includes('ERR_ABORTED')) {
    previewFailures.push(`${r.url()} — ${reason}`);
  }
});
page.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const step = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForSelector('nav', { timeout: 15000 });

await page.click('a[href="/sites"]');
await page.waitForSelector('h1:has-text("المواقع المرفوعة")', { timeout: 10000 });
step('صفحة المواقع تفتح', true);
await page.waitForTimeout(900);

const before = await page.locator('select option').count();

// رفع موقع
await page.setInputFiles('input[type=file]', zipPath);
await page.waitForTimeout(4000);
const after = await page.locator('select option').count();
step('رفع موقع ZIP يشتغل', after === before + 1, `${before} → ${after}`);

const body = await page.textContent('body');
step('رسالة النجاح تظهر', body.includes('رفعنا'));

// المعاينة
await page.waitForSelector('iframe[title="معاينة الموقع"]', { timeout: 10000 });
step('إطار المعاينة موجود', true);

const sandbox = await page.getAttribute('iframe[title="معاينة الموقع"]', 'sandbox');
step(
  'المعاينة معزولة (بدون allow-same-origin)',
  sandbox && sandbox.includes('allow-scripts') && !sandbox.includes('allow-same-origin'),
  sandbox,
);

const frame = page.frameLocator('iframe[title="معاينة الموقع"]');
await frame.locator('#title').waitFor({ timeout: 15000 });
const previewText = await frame.locator('#title').textContent();
step('الموقع يظهر داخل المعاينة', previewText?.includes('مرحبا'), previewText);

const css = previewAssets.find((a) => a.url.includes('main.css'));
step(
  'ملف CSS يتحمّل داخل المعاينة',
  css?.status === 200,
  css ? `HTTP ${css.status}` : '(ما انطلب أصلًا)',
);
step(
  'ما فيه ملف معاينة محجوب',
  previewFailures.length === 0,
  previewFailures.join(' | ') || 'صفر',
);

// الملفات
await page.click('button:has-text("الملفات")');
await page.waitForTimeout(600);
const fileRows = await page.locator('li:has-text("index.html")').count();
step('شجرة الملفات تظهر', fileRows > 0);

// فتح ملف وتعديله
await page.locator('li:has-text("css/main.css") button:has-text("افتح")').click();
await page.waitForSelector('textarea[aria-label="محتوى الملف"]', { timeout: 5000 });
step('محرّر الملف يفتح', true);

await page.fill('textarea[aria-label="محتوى الملف"]', 'body { background: #101010; color: #f0f0f0; }\n');
await page.click('button:has-text("احفظ")');
await page.waitForTimeout(2500);
const savedBody = await page.textContent('body');
step('حفظ التعديل يشتغل', savedBody.includes('حفظنا التعديل'));

// السجل
await page.click('button:has-text("السجل")');
await page.waitForTimeout(700);
const revisions = await page.locator('li.card:has-text("تعديل يدوي")').count();
step('سجل المراجعات يظهر', revisions > 0, `العدد=${revisions}`);

// الرجوع
await page.locator('button:has-text("ارجع لهنا")').first().click();
await page.waitForTimeout(2500);
const revertedBody = await page.textContent('body');
step('الرجوع للنسخة السابقة يشتغل', revertedBody.includes('رجّعنا الموقع'));

// الملف رجع لأصله
await page.click('button:has-text("الملفات")');
await page.waitForTimeout(600);
await page.locator('li:has-text("css/main.css") button:has-text("افتح")').click();
await page.waitForSelector('textarea[aria-label="محتوى الملف"]', { timeout: 5000 });
const content = await page.inputValue('textarea[aria-label="محتوى الملف"]');
step('محتوى الملف رجع لأصله', content.includes('#fff'), content.trim().slice(0, 40));
await page.click('button:has-text("الغِ")');

// الاستمرارية
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
step('المشاريع نجت من إعادة التحميل', (await page.locator('select option').count()) === after);

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
const real = problems.filter((x) => !x.includes('401 (Unauthorized)'));
console.log(real.length ? real.join('\n') : 'صفر — نظيف تمامًا');
await browser.close();
process.exit(real.length ? 1 : 0);
