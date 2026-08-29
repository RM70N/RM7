import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  encrypt,
  decrypt,
  encryptBuffer,
  decryptBuffer,
  sha256,
  safeEqual,
  randomToken,
} from './crypto.js';

describe('تشفير النصوص', () => {
  it('يشفّر ويفك بنفس النتيجة', () => {
    const text = 'هلا والله، هذي رسالة خاصة 🔒';
    assert.equal(decrypt(encrypt(text)), text);
  });

  it('كل تشفير يطلع مختلف (IV عشوائي)', () => {
    const text = 'نفس النص';
    assert.notEqual(encrypt(text), encrypt(text), 'ما ينفع يتكرر نفس الناتج');
  });

  it('النص المشفّر ما يكشف الأصل', () => {
    const secret = 'رقم حسابي السري 12345';
    assert.ok(!encrypt(secret).includes('12345'));
    assert.ok(!encrypt(secret).includes('حسابي'));
  });

  it('يبدأ بعلامة الإصدار', () => {
    assert.ok(encrypt('اختبار').startsWith('v1.'));
  });

  it('يمرّر النص غير المشفّر كما هو', () => {
    assert.equal(decrypt('نص عادي بدون تشفير'), 'نص عادي بدون تشفير');
  });

  it('يرفض النص المعدَّل عليه', () => {
    const payload = encrypt('رسالة مهمة');
    const parts = payload.split('.');
    // نعبث بالنص المشفّر
    const tampered = [parts[0], parts[1], parts[2], 'AAAA' + parts[3]!.slice(4)].join('.');
    assert.throws(() => decrypt(tampered), /فشل فك تشفير/);
  });

  it('يتعامل مع النص الفاضي', () => {
    assert.equal(decrypt(encrypt('')), '');
  });

  it('يتعامل مع نص طويل', () => {
    const long = 'سطر طويل جدًا. '.repeat(5000);
    assert.equal(decrypt(encrypt(long)), long);
  });
});

describe('تشفير الملفات', () => {
  it('يشفّر ويفك البيانات الثنائية', () => {
    const data = Buffer.from([0, 1, 2, 255, 128, 64, 0, 0]);
    assert.deepEqual(decryptBuffer(encryptBuffer(data)), data);
  });

  it('يتعامل مع ملف فاضي', () => {
    assert.equal(decryptBuffer(encryptBuffer(Buffer.alloc(0))).length, 0);
  });

  it('الناتج أكبر من الأصل (IV + بصمة)', () => {
    const data = Buffer.from('محتوى ملف');
    assert.ok(encryptBuffer(data).length > data.length);
  });
});

describe('أدوات مساعدة', () => {
  it('sha256 ثابت لنفس المدخل', () => {
    assert.equal(sha256('احسمها'), sha256('احسمها'));
    assert.notEqual(sha256('احسمها'), sha256('احسمهاا'));
  });

  it('safeEqual يقارن صح', () => {
    assert.equal(safeEqual('abc', 'abc'), true);
    assert.equal(safeEqual('abc', 'abd'), false);
    assert.equal(safeEqual('abc', 'abcd'), false, 'أطوال مختلفة = غير متساوي');
  });

  it('randomToken ما يتكرر', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken(16)));
    assert.equal(tokens.size, 200);
  });
});
