import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  chunkText,
  cleanText,
  isSupported,
  parseDocument,
  typeLabel,
} from './parsers.js';

describe('تنظيف النص', () => {
  it('يوحّد نهايات الأسطر', () => {
    assert.equal(cleanText('سطر\r\nسطر ثاني'), 'سطر\nسطر ثاني');
  });

  it('يشيل المحارف غير المرئية', () => {
    assert.equal(cleanText('​نص‎عربي﻿'), 'نصعربي');
  });

  it('يضغط الفراغات والأسطر الزايدة', () => {
    assert.equal(cleanText('كلمة     ثانية'), 'كلمة ثانية');
    assert.equal(cleanText('فقرة\n\n\n\n\nفقرة'), 'فقرة\n\nفقرة');
  });

  it('يشيل الفراغ من الأطراف', () => {
    assert.equal(cleanText('   نص   '), 'نص');
  });
});

describe('أنواع الملفات', () => {
  it('يقبل الأنواع المدعومة', () => {
    assert.equal(isSupported('application/pdf'), true);
    assert.equal(isSupported('text/csv'), true);
    assert.equal(isSupported('image/png'), true);
  });

  it('يرفض غير المدعوم', () => {
    assert.equal(isSupported('application/x-executable'), false);
    assert.equal(isSupported('video/mp4'), false);
  });

  it('يعطي تسمية عربية', () => {
    assert.equal(typeLabel('application/pdf'), 'PDF');
    assert.equal(typeLabel('image/png'), 'صورة');
    assert.equal(typeLabel('غير/معروف'), 'ملف');
  });

  it('يرفض الملف غير المدعوم برسالة واضحة', async () => {
    await assert.rejects(
      () => parseDocument(Buffer.from('x'), 'video/mp4'),
      /مو مدعوم/,
    );
  });
});

describe('قراءة النصوص', () => {
  it('يقرأ النص العادي', async () => {
    const result = await parseDocument(Buffer.from('نص عربي بسيط', 'utf8'), 'text/plain');
    assert.equal(result.text, 'نص عربي بسيط');
  });

  it('يقرأ CSV ويفصل الأعمدة', async () => {
    const csv = 'الاسم,المدينة\nمحمد,الرياض\n';
    const result = await parseDocument(Buffer.from(csv, 'utf8'), 'text/csv');
    assert.ok(result.text.includes('الاسم | المدينة'));
    assert.ok(result.text.includes('محمد | الرياض'));
    assert.equal(result.meta?.rows, 2);
  });

  it('يتعامل مع CSV فيه BOM', async () => {
    const csv = '﻿أ,ب\n1,2\n';
    const result = await parseDocument(Buffer.from(csv, 'utf8'), 'text/csv');
    assert.ok(result.text.includes('أ | ب'));
  });

  it('يتعامل مع الملف الفاضي', async () => {
    const result = await parseDocument(Buffer.alloc(0), 'text/plain');
    assert.equal(result.text, '');
  });
});

describe('التقطيع', () => {
  it('النص القصير يصير مقطع واحد', () => {
    const chunks = chunkText('نص قصير');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.ordinal, 0);
  });

  it('النص الفاضي ما يعطي مقاطع', () => {
    assert.deepEqual(chunkText(''), []);
    assert.deepEqual(chunkText('   '), []);
  });

  it('يقسّم النص الطويل', () => {
    const long = 'جملة عربية للاختبار. '.repeat(300);
    const chunks = chunkText(long, 500, 60);
    assert.ok(chunks.length > 5);
    assert.ok(chunks.every((c) => c.content.length <= 500));
  });

  it('الترتيب متسلسل بدون فجوات', () => {
    const chunks = chunkText('كلام. '.repeat(500), 400, 50);
    chunks.forEach((chunk, index) => assert.equal(chunk.ordinal, index));
  });

  it('يفضّل القطع عند حدود الجمل', () => {
    const text = `${'أ'.repeat(400)}. ${'ب'.repeat(400)}`;
    const chunks = chunkText(text, 500, 50);
    assert.ok(chunks.length >= 2);
    // أول مقطع لازم ينتهي عند النقطة، مو بنص كلمة
    assert.ok(chunks[0]!.content.trimEnd().endsWith('.'));
  });

  it('التداخل يمنع ضياع المعنى على الحدود', () => {
    const text = 'كلمة '.repeat(400);
    const chunks = chunkText(text, 500, 100);
    assert.ok(chunks.length >= 2);
    // مجموع المقاطع أطول من الأصل بسبب التداخل
    const total = chunks.reduce((sum, c) => sum + c.content.length, 0);
    assert.ok(total > text.trim().length);
  });

  it('ما يعلّق مع تداخل أكبر من المقطع', () => {
    const chunks = chunkText('نص طويل جدًا. '.repeat(100), 200, 500);
    assert.ok(chunks.length > 0);
    assert.ok(chunks.length < 1000, 'ما يدخل في حلقة لا نهائية');
  });
});
