/**
 * اختبار صفحة الذاكرة الدائمة عبر متصفح حقيقي.
 * التشغيل: شغّل npm run dev ثم: node tests/memory.e2e.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const PW = readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').find(l=>l.startsWith('OWNER_PASSWORD=')).slice(15).trim();
const problems = [];
const b = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
p.on('console', m => { if (m.type()==='error'||m.type()==='warning') problems.push(`[${m.type()}] ${m.text()}`); });
p.on('pageerror', e => problems.push(`[pageerror] ${e.message}`));
const step=(n,ok,x='')=>console.log(`${ok?'PASS':'FAIL'} — ${n}${x?' :: '+x:''}`);

await p.goto('http://localhost:5173/', { waitUntil:'networkidle' });
await p.fill('#password', PW);
await p.click('button[type=submit]');
await p.waitForSelector('nav', { timeout: 15000 });

await p.click('a[href="/memory"]');
await p.waitForSelector('h1:has-text("الذاكرة")', { timeout: 10000 });
step('صفحة الذاكرة تفتح', true);

// الذكريات الثلاث من اختبار API لازم تظهر
await p.waitForTimeout(700);
const count = await p.locator('li.card').count();
step('الذكريات المحفوظة تظهر', count === 3, `العدد=${count}`);

// الإحصائيات
const body = await p.textContent('body');
step('الإحصائيات تظهر', body.includes('مثبّتة') && body.includes('يدوية'));

// شارة المثبّتة
const pinnedBadge = await p.locator('span:has-text("مثبّتة")').count();
step('شارة التثبيت تظهر', pinnedBadge > 0);

// إضافة ذكرى جديدة
await p.click('button:has-text("أضف ذكرى")');
await p.waitForSelector('#mem-title', { timeout: 5000 });
step('نموذج الإضافة يفتح', true);
await p.fill('#mem-title', 'اختبار المتصفح');
await p.fill('#mem-content', 'هذي ذكرى انضافت من المتصفح للتأكد');
await p.selectOption('#mem-cat', 'instruction');
await p.click('button:has-text("احفظ")');
await p.waitForTimeout(1000);
const afterAdd = await p.locator('li.card').count();
step('الإضافة تشتغل', afterAdd === 4, `العدد=${afterAdd}`);

// البحث
await p.fill('input[type=search]', 'اختبار المتصفح');
await p.waitForTimeout(700);
const searched = await p.locator('li.card').count();
step('البحث يصفّي', searched === 1, `العدد=${searched}`);

// التعديل
await p.click('button:has-text("عدّل")');
await p.waitForSelector('#mem-title', { timeout: 5000 });
await p.fill('#mem-content', 'المحتوى بعد التعديل');
await p.click('button:has-text("احفظ")');
await p.waitForTimeout(900);
const edited = await p.textContent('body');
step('التعديل يحفظ', edited.includes('المحتوى بعد التعديل'));

// التثبيت
await p.click('button:has-text("ثبّت")');
await p.waitForTimeout(800);
const pinnedNow = await p.locator('button:has-text("فكّ")').count();
step('التثبيت يشتغل', pinnedNow > 0);

// الحذف مع التأكيد
await p.click('button:has-text("احذف")');
await p.waitForSelector('[role=dialog]', { timeout: 5000 });
step('حوار التأكيد يظهر قبل الحذف', true);
await p.click('[role=dialog] button:has-text("احذف")');
await p.waitForTimeout(900);
await p.fill('input[type=search]', '');
await p.waitForTimeout(700);
const afterDelete = await p.locator('li.card').count();
step('الحذف يشتغل', afterDelete === 3, `العدد=${afterDelete}`);

// الاستمرارية
await p.reload({ waitUntil:'networkidle' });
await p.waitForTimeout(1200);
const afterReload = await p.locator('li.card').count();
step('الذاكرة نجت من إعادة التحميل', afterReload === 3, `العدد=${afterReload}`);

console.log('\n=== أخطاء/تحذيرات المتصفح ===');
const real = problems.filter(x => !x.includes('401 (Unauthorized)'));
console.log(real.length ? real.join('\n') : 'صفر — نظيف تمامًا');
await b.close();
process.exit(real.length ? 1 : 0);
