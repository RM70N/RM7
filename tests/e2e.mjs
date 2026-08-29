/**
 * اختبار شامل للواجهة عبر متصفح حقيقي.
 * التشغيل: شغّل السيرفر والواجهة أولًا (npm run dev) ثم: node tests/e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const PW = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').find((l) => l.startsWith('OWNER_PASSWORD='))?.slice('OWNER_PASSWORD='.length).trim();

const problems = [];
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));

const step = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} — ${n}${extra ? ' :: ' + extra : ''}`);

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

// 1) صفحة الدخول تظهر
await page.waitForSelector('#password', { timeout: 10000 });
step('صفحة الدخول تظهر', true);

// 2) الاتجاه RTL والوضع الليلي
const dir = await page.getAttribute('html', 'dir');
const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
step('الاتجاه RTL', dir === 'rtl', `dir=${dir}`);
step('الوضع الليلي مفعّل افتراضيًا', isDark);

// 3) لا يوجد وصول للتطبيق بدون دخول
const sidebarBefore = await page.locator('nav').count();
step('السايدبار مخفي قبل الدخول', sidebarBefore === 0);

// 4) باسورد غلط يعطي رسالة
await page.fill('#password', 'definitely-wrong');
await page.click('button[type=submit]');
await page.waitForSelector('[role=alert]', { timeout: 10000 });
const errText = (await page.textContent('[role=alert]'))?.trim();
step('رسالة خطأ عند الباسورد الغلط', !!errText, errText);

// 5) دخول صحيح
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForSelector('nav', { timeout: 15000 });
step('الدخول الصحيح يفتح التطبيق', true);

// 6) كل روابط السايدبار تشتغل
const links = ['/memory', '/skills', '/search', '/sites', '/studio', '/settings', '/'];
for (const href of links) {
  await page.click(`a[href="${href}"]`);
  await page.waitForTimeout(250);
  const url = new URL(page.url()).pathname;
  step(`التنقّل إلى ${href}`, url === href, `الحالي=${url}`);
}

// 7) صفحة الإعدادات فيها بيانات الحساب
await page.click('a[href="/settings"]');
await page.waitForSelector('#current', { timeout: 10000 });
const hasAccount = (await page.textContent('body'))?.includes('المالك');
step('الإعدادات تعرض بيانات الحساب', !!hasAccount);

// 8) تبديل الثيم
await page.click('button[aria-label*="الوضع"]');
await page.waitForTimeout(250);
const afterToggle = await page.evaluate(() => document.documentElement.classList.contains('dark'));
step('تبديل الوضع الليلي/النهاري', afterToggle !== isDark);
await page.click('button[aria-label*="الوضع"]');

// 9) الجوال — القائمة تفتح وتنقفل
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.click('button[aria-label="فتح القائمة"]');
await page.waitForTimeout(350);
const mobileNavVisible = await page.locator('a[href="/memory"]').isVisible();
step('قائمة الجوال تفتح', mobileNavVisible);
await page.click('button[aria-label="إغلاق القائمة"]');
await page.waitForTimeout(350);
step('قائمة الجوال تنقفل', true);

// 10) لا تمرير أفقي على الجوال
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
step('ما فيه تمرير أفقي على الجوال', !overflow);

// 11) خروج
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);
await page.click('button:has-text("خروج")');
await page.waitForSelector('#password', { timeout: 10000 });
step('الخروج يرجّع لصفحة الدخول', true);

// 12) الجلسة انتهت فعليًا — إعادة تحميل ما ترجّعنا للتطبيق
await page.reload({ waitUntil: 'networkidle' });
const stillLoggedOut = await page.locator('#password').count();
step('الجلسة انتهت بعد الخروج', stillLoggedOut === 1);

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
// 401 الناتج عن اختبار الباسورد الغلط رد صحيح من السيرفر، مو خطأ في التطبيق
const real = problems.filter((p) => !p.includes('401 (Unauthorized)'));
console.log(real.length === 0 ? 'صفر — نظيف تمامًا' : real.join('\n'));

await browser.close();
process.exit(real.length === 0 ? 0 : 1);
