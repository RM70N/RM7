/**
 * اختبار صفحة البحث الحي عبر متصفح حقيقي.
 * ملاحظة: البحث الفعلي يحتاج إنترنت — الاختبار يتحقق من الواجهة
 * ومن رسالة الخطأ الواضحة لما الشبكة محجوبة.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PW = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('OWNER_PASSWORD=')).slice('OWNER_PASSWORD='.length).trim();

const problems = [];
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => { if (m.type()==='error'||m.type()==='warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const step = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${x ? ' :: ' + x : ''}`);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForSelector('nav', { timeout: 15000 });

await page.click('a[href="/search"]');
await page.waitForSelector('h1:has-text("البحث الحي")', { timeout: 10000 });
step('صفحة البحث تفتح', true);

await page.waitForTimeout(800);
const body = await page.textContent('body');
step('حالة المزوّد تظهر', body.includes('المزوّد'));
step('حالة البحث التلقائي تظهر', body.includes('البحث التلقائي'));

// بحث — الشبكة محجوبة هنا فنتوقع رسالة واضحة مو انهيار
await page.fill('input[type=search]', 'أخبار التقنية');
await page.click('button[type=submit]');
await page.waitForTimeout(6000);
const afterSearch = await page.textContent('body');
const hasResults = (await page.locator('li.card').count()) > 0;
const hasClearError = (await page.locator('[role=alert]').count()) > 0;
step(
  'البحث يعطي نتائج أو رسالة واضحة',
  hasResults || hasClearError,
  hasResults ? 'نتائج' : 'رسالة خطأ واضحة',
);
step('ما فيه انهيار', !afterSearch.includes('صار خلل داخلي'));

// زر البحث في الشات
await page.click('a[href="/"]');
await page.waitForSelector('textarea', { timeout: 10000 });
const toggle = await page.locator('button[aria-pressed]').count();
step('زر البحث الحي موجود في الشات', toggle > 0);

await page.locator('button[aria-pressed]').first().click();
await page.waitForTimeout(300);
const pressed = await page.getAttribute('button[aria-pressed]', 'aria-pressed');
step('زر البحث يتبدّل', pressed === 'true');

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
const real = problems.filter((x) => !x.includes('401 (Unauthorized)') && !x.includes('400 (Bad Request)'));
console.log(real.length ? real.join('\n') : 'صفر — نظيف تمامًا');
await browser.close();
process.exit(real.length ? 1 : 0);
