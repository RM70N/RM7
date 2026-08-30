/**
 * اختبار الاستوديو البصري عبر متصفح حقيقي.
 * التشغيل: شغّل npm run dev ثم: node tests/studio.e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PW = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('OWNER_PASSWORD=')).slice('OWNER_PASSWORD='.length).trim();

const problems = [];
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
page.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const step = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForSelector('nav', { timeout: 15000 });

await page.click('a[href="/studio"]');
await page.waitForSelector('h1:has-text("الاستوديو البصري")', { timeout: 10000 });
step('صفحة الاستوديو تفتح', true);
await page.waitForTimeout(1200);

const body = await page.textContent('body');
step('ما فيه تحذير رسم', !body.includes('ما لقينا متصفح للرسم'));
step('ما فيه تحذير ffmpeg', !body.includes('ما لقينا ffmpeg —'));

const before = await page.locator('li.card').count();

// توليد صورة
await page.fill('#img-title', 'اختبار المتصفح للاستوديو');
await page.fill('#img-sub', 'نص فرعي تجريبي');
await page.selectOption('#img-tpl', 'social');
await page.selectOption('#img-pal', 'sahara');
await page.click('button:has-text("ولّد الصورة")');
await page.waitForTimeout(9000);
const after = await page.locator('li.card').count();
step('توليد الصورة يشتغل', after === before + 1, `${before} → ${after}`);

// الصورة تُعرض فعليًا
const img = page.locator('li.card img').first();
await img.waitFor({ timeout: 10000 });
const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
step('الصورة تُعرض في المعرض', loaded);

// المعاينة الكبيرة
await img.click();
await page.waitForSelector('[role=dialog]', { timeout: 5000 });
step('المعاينة الكبيرة تفتح', true);
await page.click('[role=dialog]');
await page.waitForTimeout(400);

// تبويب الموشن
await page.click('button:has-text("موشن جرافيك")');
await page.waitForSelector('#mot-title', { timeout: 5000 });
step('تبويب الموشن يفتح', true);

const motionCount = await page.locator('li.card video').count();
step('الموشن المولّد سابقًا يظهر كفيديو', motionCount > 0, `العدد=${motionCount}`);

// تبويب الفيديو
await page.click('button:has-text("فيديو")');
await page.waitForTimeout(700);
const picker = await page.locator('button:has(img)').count();
step('منتقي الصور للفيديو يظهر', picker > 0, `العدد=${picker}`);

// اختيار صور
await page.locator('button:has(img)').first().click();
await page.waitForTimeout(300);
const badge = await page.locator('span:has-text("1")').count();
step('اختيار الصور يرقّمها', badge > 0);

// الاستمرارية
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
step('المخرجات نجت من إعادة التحميل', (await page.locator('li.card').count()) === after);

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
const real = problems.filter((x) => !x.includes('401 (Unauthorized)'));
console.log(real.length ? real.join('\n') : 'صفر — نظيف تمامًا');
await browser.close();
process.exit(real.length ? 1 : 0);
