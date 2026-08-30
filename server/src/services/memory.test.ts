import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { Memory } from '@prisma/client';
import {
  isDuplicate,
  normalizeArabic,
  parseExtraction,
  rankMemories,
} from './memory.service.js';

function makeMemory(over: Partial<Memory> = {}): Memory {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'عنوان',
    content: 'محتوى',
    category: 'fact',
    importance: 3,
    source: 'manual',
    sourceRef: null,
    pinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Memory;
}

describe('تطبيع النص العربي', () => {
  it('يوحّد الهمزات', () => {
    assert.equal(normalizeArabic('أحمد'), normalizeArabic('احمد'));
    assert.equal(normalizeArabic('إبراهيم'), normalizeArabic('ابراهيم'));
  });

  it('يوحّد الألف المقصورة والتاء المربوطة', () => {
    assert.equal(normalizeArabic('على'), normalizeArabic('علي'));
    assert.equal(normalizeArabic('مدينة'), normalizeArabic('مدينه'));
  });

  it('يشيل التشكيل وعلامات الترقيم', () => {
    assert.equal(normalizeArabic('مَرْحَبًا!'), 'مرحبا');
  });
});

describe('تحليل الاستخراج', () => {
  it('يقرأ JSON نظيف', () => {
    const out = parseExtraction(
      '[{"title":"مدينته","content":"يسكن في الرياض","category":"personal","importance":4}]',
    );
    assert.equal(out.length, 1);
    assert.equal(out[0]!.title, 'مدينته');
    assert.equal(out[0]!.category, 'personal');
    assert.equal(out[0]!.importance, 4);
  });

  it('يقرأ JSON مغلّف بماركداون', () => {
    const out = parseExtraction(
      '```json\n[{"title":"أ","content":"ب","category":"fact","importance":3}]\n```',
    );
    assert.equal(out.length, 1);
  });

  it('يقرأ JSON محاط بكلام زايد', () => {
    const out = parseExtraction(
      'طيب، هذي المعلومات:\n[{"title":"أ","content":"ب"}]\nهذا كل شي.',
    );
    assert.equal(out.length, 1);
  });

  it('يرجع فاضي للمصفوفة الفاضية', () => {
    assert.deepEqual(parseExtraction('[]'), []);
  });

  it('يرجع فاضي للنص التالف بدل ما ينهار', () => {
    assert.deepEqual(parseExtraction('كلام بلا معنى t392 t415'), []);
    assert.deepEqual(parseExtraction('[{غير صالح'), []);
    assert.deepEqual(parseExtraction(''), []);
    assert.deepEqual(parseExtraction('{"مو":"مصفوفة"}'), []);
  });

  it('يتجاهل العناصر الناقصة ويحتفظ بالصالحة', () => {
    const out = parseExtraction(
      '[{"title":"صالح","content":"محتوى"},{"title":""},{"content":"بدون عنوان"},{"title":"صالح ثاني","content":"محتوى ثاني"}]',
    );
    assert.equal(out.length, 2);
  });

  it('يصلّح التصنيف والأهمية غير الصالحين', () => {
    const out = parseExtraction(
      '[{"title":"أ","content":"ب","category":"تصنيف_مخترع","importance":99}]',
    );
    assert.equal(out[0]!.category, 'fact', 'التصنيف المجهول يصير fact');
    assert.equal(out[0]!.importance, 5, 'الأهمية تنحصر بين 1 و5');
  });

  it('يرفض النصوص الطويلة جدًا', () => {
    const out = parseExtraction(
      JSON.stringify([{ title: 'أ'.repeat(300), content: 'ب' }]),
    );
    assert.equal(out.length, 0);
  });
});

describe('كشف التكرار', () => {
  const existing = [
    makeMemory({ title: 'مدينته', content: 'يسكن في الرياض' }),
    makeMemory({ title: 'شغله', content: 'مطوّر برمجيات' }),
  ];

  it('يكشف التطابق الحرفي', () => {
    assert.equal(
      isDuplicate(
        { title: 'مدينته', content: 'يسكن في الرياض', category: 'personal', importance: 3 },
        existing,
      ),
      true,
    );
  });

  it('يكشف التطابق رغم اختلاف الهمزات', () => {
    assert.equal(
      isDuplicate(
        { title: 'مدينته', content: 'يسكن فى الرياض', category: 'personal', importance: 3 },
        existing,
      ),
      true,
    );
  });

  it('يمرّر المعلومة الجديدة', () => {
    assert.equal(
      isDuplicate(
        { title: 'لغته المفضلة', content: 'يفضّل تايب سكربت', category: 'preference', importance: 4 },
        existing,
      ),
      false,
    );
  });
});

describe('ترتيب الذكريات للحقن', () => {
  it('المثبّتة تجي أولًا مهما كان', () => {
    const pinned = makeMemory({ title: 'مثبّتة', content: 'شي ما له علاقة', pinned: true });
    const relevant = makeMemory({ title: 'الرياض', content: 'يسكن في الرياض', importance: 5 });

    const ranked = rankMemories([relevant, pinned], 'وش أخبار الرياض');
    assert.equal(ranked[0]!.id, pinned.id);
  });

  it('الأعلى صلة تجي قبل الأقل', () => {
    const relevant = makeMemory({ title: 'برمجة', content: 'يحب تايب سكربت والبرمجة' });
    const other = makeMemory({ title: 'طعام', content: 'يحب الكبسة' });

    const ranked = rankMemories([other, relevant], 'ساعدني في البرمجة بتايب سكربت');
    assert.equal(ranked[0]!.id, relevant.id);
  });

  it('يحترم الحد الأقصى', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      makeMemory({ title: `ذكرى ${i}`, content: `محتوى ${i}` }),
    );
    assert.equal(rankMemories(many, 'أي شي', 10).length, 10);
  });

  it('يشتغل مع قائمة فاضية', () => {
    assert.deepEqual(rankMemories([], 'استعلام'), []);
  });

  it('يشتغل مع استعلام فاضي', () => {
    const memories = [makeMemory(), makeMemory()];
    assert.equal(rankMemories(memories, '').length, 2);
  });
});
