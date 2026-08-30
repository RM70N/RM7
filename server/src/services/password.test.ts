import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './auth.service.js';

describe('تجزئة الباسورد', () => {
  it('يتحقق من الباسورد الصحيح', async () => {
    const hash = await hashPassword('كلمة-سر-قوية-Test123!');
    assert.equal(await verifyPassword(hash, 'كلمة-سر-قوية-Test123!'), true);
  });

  it('يرفض الباسورد الغلط', async () => {
    const hash = await hashPassword('الصحيح');
    assert.equal(await verifyPassword(hash, 'الغلط'), false);
  });

  it('يطلع صيغة PHC قياسية بمعاملات OWASP', async () => {
    const hash = await hashPassword('أي-باسورد');
    // الصيغة القياسية تخلي الهاشات القديمة تظل صالحة لو بدّلنا المكتبة
    assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('يعطي ملحًا مختلفًا لكل تجزئة', async () => {
    const [a, b] = await Promise.all([hashPassword('نفس-الباسورد'), hashPassword('نفس-الباسورد')]);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword(a, 'نفس-الباسورد'), true);
    assert.equal(await verifyPassword(b, 'نفس-الباسورد'), true);
  });

  it('يتحقق من هاش أنتجته مكتبة argon2 الأصلية', async () => {
    // هاش ثابت لـ "ahsmaha-legacy-password" ولّدته مكتبة argon2 الأصلية.
    // لو انكسر، معناه الهاشات المحفوظة عند المستخدمين بطلت تشتغل.
    const legacy =
      '$argon2id$v=19$m=19456,t=2,p=1$SkWUIgLY/cTfqnMz5AiPqg$' +
      'c9eHRZYUhYSouZYvIgMhyMrow9E7ucUt2qYjCjndkT0';
    assert.equal(await verifyPassword(legacy, 'ahsmaha-legacy-password'), true);
    assert.equal(await verifyPassword(legacy, 'شي-ثاني'), false);
  });

  it('يرجّع false للهاش المشوّه بدل ما ينهار', async () => {
    for (const bad of ['', 'مو-هاش', '$argon2id$broken', '$2b$10$notargon']) {
      assert.equal(await verifyPassword(bad, 'أي-شي'), false, `انهار على: ${bad}`);
    }
  });
});
