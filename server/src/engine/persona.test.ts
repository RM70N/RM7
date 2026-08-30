import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildPersonaSections,
  buildSystemPrompt,
  fitSystemPrompt,
  scoreDialect,
  CORE_PERSONA,
  COMPACT_PERSONA,
} from './persona.js';

/** عدّاد تقريبي: كل 3 أحرف ≈ رمز. كافٍ لاختبار منطق الميزانية. */
const countTokens = (text: string): number => Math.ceil(text.length / 3);

describe('شخصية احسمها', () => {
  it('البرومبت الأساسي يمنع الفصحى واللهجات الثانية', () => {
    assert.ok(CORE_PERSONA.includes('سعودي'));
    assert.ok(CORE_PERSONA.includes('ممنوع'));
    assert.ok(CORE_PERSONA.includes('احسمها'));
  });

  it('ما ينتسب لأي شركة ثانية', () => {
    assert.ok(CORE_PERSONA.includes('ما تنتسب لأي شركة ثانية'));
    assert.ok(COMPACT_PERSONA.includes('ما تنتسب لأي شركة ثانية'));
  });

  it('يبني الأقسام بالأولويات الصحيحة', () => {
    const sections = buildPersonaSections({
      memories: ['يحب القهوة'],
      knowledge: ['محتوى ملف'],
      searchResults: 'نتيجة بحث',
    });

    const core = sections.find((s) => s.key === 'core');
    assert.equal(core?.priority, 0, 'الشخصية الأساسية ما تنسقط أبدًا');

    const memories = sections.find((s) => s.key === 'memories');
    const knowledge = sections.find((s) => s.key === 'knowledge');
    assert.ok(memories!.priority < knowledge!.priority, 'الذاكرة أهم من المعرفة المسترجعة');
  });

  it('يدخل السياق كامل إذا الميزانية واسعة', () => {
    const result = fitSystemPrompt(
      { memories: ['يحب القهوة'], knowledge: ['ملف مهم'] },
      countTokens,
      100_000,
    );
    assert.equal(result.dropped.length, 0);
    assert.equal(result.compact, false);
    assert.ok(result.prompt.includes('يحب القهوة'));
    assert.ok(result.prompt.includes('ملف مهم'));
  });

  it('يسقط الأقل أهمية أولًا عند ضيق الميزانية', () => {
    const budget = countTokens(CORE_PERSONA) + 40;
    const result = fitSystemPrompt(
      {
        memories: ['ذاكرة قصيرة'],
        knowledge: ['معرفة '.repeat(500)],
        searchResults: 'بحث '.repeat(500),
      },
      countTokens,
      budget,
    );

    assert.ok(countTokens(result.prompt) <= budget, 'لازم يدخل في الميزانية');
    assert.ok(result.dropped.includes('knowledge'));
    assert.ok(result.dropped.includes('search'));
  });

  it('ينتقل للشخصية المختصرة إذا الميزانية ضيقة جدًا', () => {
    const tiny = Math.floor(countTokens(CORE_PERSONA) / 2);
    const result = fitSystemPrompt({}, countTokens, tiny);
    assert.equal(result.compact, true);
    assert.ok(result.prompt.includes('احسمها'), 'الهوية تبقى حتى في أضيق حالة');
  });

  it('ما يرجع برومبت فاضي أبدًا', () => {
    const result = fitSystemPrompt({}, countTokens, 1);
    assert.ok(result.prompt.length > 0);
    assert.ok(result.prompt.includes('احسمها'));
  });

  it('يضيف تاريخ اليوم', () => {
    assert.ok(buildSystemPrompt().includes('بتوقيت الرياض'));
  });
});

describe('قياس اللهجة', () => {
  it('يعطي درجة عالية للسعودي', () => {
    const { score, saudi } = scoreDialect(
      'هلا والله، ابشر يالغالي. الحين أشرح لك وش الفكرة، وبصراحة زين مرة.',
    );
    assert.ok(saudi >= 4, `توقعنا مؤشرات سعودية كثيرة، لقينا ${saudi}`);
    assert.ok(score > 0.5, `الدرجة ضعيفة: ${score}`);
  });

  it('يعاقب الفصحى الرسمية', () => {
    const { formal, score } = scoreDialect(
      'أهلاً وسهلاً بك، يسعدني أن أساعدك. بكل تأكيد سأقوم بذلك.',
    );
    assert.ok(formal >= 2, 'لازم يكتشف الفصحى الرسمية');
    assert.equal(score, 0, 'الفصحى الرسمية تصفّر الدرجة');
  });

  it('يعاقب اللهجة المصرية', () => {
    const { formal } = scoreDialect('إزيك، عايز إيه دلوقتي؟');
    assert.ok(formal >= 2, 'لازم يكتشف المصرية');
  });

  it('يتعامل مع اختلاف الهمزات', () => {
    const withHamza = scoreDialect('أبشر يالغالي');
    const without = scoreDialect('ابشر يالغالي');
    assert.equal(withHamza.saudi, without.saudi, 'التطبيع لازم يوحّد النتيجة');
  });
});
