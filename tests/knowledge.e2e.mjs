/**
 * اختبار صفحة المهارات وقاعدة المعرفة عبر متصفح حقيقي.
 * التشغيل: شغّل npm run dev ثم: node tests/knowledge.e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

await page.click('a[href="/skills"]');
await page.waitForSelector('h1:has-text("المهارات")', { timeout: 10000 });
step('صفحة المهارات تفتح', true);

await page.waitForTimeout(800);
const body1 = await page.textContent('body');
step('الإحصائيات تظهر', body1.includes('مقاطع مفهرسة') && body1.includes('بمتجهات'));

// المهارة المضافة من الـ API لازم تظهر
const skillCount = await page.locator('li.card').count();
step('المهارات المحفوظة تظهر', skillCount >= 1, `العدد=${skillCount}`);
step('شارة الدائمة تظهر', (await page.locator('span:has-text("دائمة")').count()) > 0);

// إضافة مهارة
await page.click('button:has-text("أضف مهارة")');
await page.waitForSelector('#sk-title', { timeout: 5000 });
await page.fill('#sk-title', 'مهارة من المتصفح');
await page.fill('#sk-content', 'تعليمات مكتوبة من اختبار المتصفح للتأكد من الحفظ والفهرسة');
await page.fill('#sk-tags', 'اختبار، متصفح');
await page.click('button:has-text("احفظ")');
await page.waitForTimeout(1500);
const afterAdd = await page.locator('li.card').count();
step('إضافة مهارة تشتغل', afterAdd === skillCount + 1, `العدد=${afterAdd}`);
step('الوسوم تظهر', (await page.locator('span:has-text("متصفح")').count()) > 0);

// تبويب الملفات
await page.click('button:has-text("الملفات")');
await page.waitForSelector('text=اسحب ملفاتك هنا', { timeout: 5000 });
step('تبويب الملفات يفتح', true);

const docs = await page.locator('li.card').count();
step('الملفات المرفوعة تظهر', docs >= 4, `العدد=${docs}`);
step('حالة جاهز تظهر', (await page.locator('span:has-text("جاهز")').count()) >= 4);

// رفع ملف من المتصفح
const dir = mkdtempSync(join(tmpdir(), 'ahsmaha-'));
// نستخدم مسارًا لاتينيًا — بعض بيئات المتصفح ما تتعامل مع مسارات
// عربية في setInputFiles. الأسماء العربية مختبرة على مستوى الـ API.
const upload = join(dir, 'browser-upload.txt');
writeFileSync(upload, 'محتوى مرفوع من اختبار المتصفح. كلمة مميزة: زعفران.', 'utf8');
await page.setInputFiles('input[type=file]', upload);
await page.waitForTimeout(4000);
const afterUpload = await page.locator('li.card').count();
step('الرفع من المتصفح يشتغل', afterUpload === docs + 1, `العدد=${afterUpload}`);

const body2 = await page.textContent('body');
step('اسم الملف يظهر صح', body2.includes('browser-upload.txt'));

// الحذف مع تأكيد
await page.locator('li.card').first().locator('button:has-text("احذف")').click();
await page.waitForSelector('[role=dialog]', { timeout: 5000 });
step('حوار التأكيد قبل الحذف', true);
await page.click('[role=dialog] button:has-text("احذف")');
await page.waitForTimeout(1500);
const afterDelete = await page.locator('li.card').count();
step('الحذف يشتغل', afterDelete === docs, `العدد=${afterDelete}`);

// الاستمرارية
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('button:has-text("الملفات")');
await page.waitForTimeout(600);
step('البيانات نجت من إعادة التحميل', (await page.locator('li.card').count()) === docs);

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
const real = problems.filter((x) => !x.includes('401 (Unauthorized)'));
console.log(real.length ? real.join('\n') : 'صفر — نظيف تمامًا');
await browser.close();
process.exit(real.length ? 1 : 0);
