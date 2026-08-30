import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  decodeEntities,
  extractTitle,
  htmlToText,
  isPrivateHost,
  needsSearch,
  normalizeDuckDuckGoUrl,
  parseDuckDuckGo,
  parseSearxng,
} from './search.service.js';

describe('تحويل HTML لنص', () => {
  it('يشيل الوسوم', () => {
    assert.equal(htmlToText('<p>مرحبا <b>بالعالم</b></p>').trim(), 'مرحبا بالعالم');
  });

  it('يشيل السكربتات والأنماط كليًا', () => {
    const html = '<div>نص<script>alert("x")</script><style>body{}</style>ظاهر</div>';
    const text = htmlToText(html);
    assert.ok(!text.includes('alert'));
    assert.ok(!text.includes('body{}'));
    assert.ok(text.includes('نص'));
    assert.ok(text.includes('ظاهر'));
  });

  it('يحوّل الفواصل الكتلية لأسطر', () => {
    assert.ok(htmlToText('<p>أول</p><p>ثاني</p>').includes('\n'));
  });

  it('يفك كيانات HTML', () => {
    assert.equal(decodeEntities('&amp; &lt; &gt; &quot;'), '& < > "');
    assert.equal(decodeEntities('&#1575;&#1604;&#1587;&#1604;&#1575;&#1605;'), 'السلام');
    assert.equal(decodeEntities('&hellip;'), '…');
  });

  it('يطلع عنوان الصفحة', () => {
    assert.equal(extractTitle('<html><head><title>عنوان الصفحة</title></head></html>'), 'عنوان الصفحة');
    assert.equal(extractTitle('<html><body>بدون عنوان</body></html>'), '');
  });
});

describe('روابط DuckDuckGo', () => {
  it('يفك الرابط الملفوف', () => {
    assert.equal(
      normalizeDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage'),
      'https://example.com/page',
    );
  });

  it('يمرّر الرابط المباشر', () => {
    assert.equal(normalizeDuckDuckGoUrl('https://example.com/a'), 'https://example.com/a');
  });

  it('يرفض غير HTTP', () => {
    assert.equal(normalizeDuckDuckGoUrl('javascript:alert(1)'), null);
    assert.equal(normalizeDuckDuckGoUrl('mailto:a@b.c'), null);
  });
});

describe('تحليل نتائج البحث', () => {
  const sample = `
    <div class="results">
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsa.example%2Fnews">
          أخبار السعودية
        </a>
        <a class="result__snippet">آخر الأخبار المحلية والعالمية</a>
      </div>
      <div class="result">
        <a class="result__a" href="https://second.example/page">الموقع الثاني</a>
        <a class="result__snippet">وصف الموقع الثاني</a>
      </div>
    </div>`;

  it('يطلع النتائج مع الرابط والمقتطف', () => {
    const results = parseDuckDuckGo(sample, 10);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.url, 'https://sa.example/news');
    assert.equal(results[0]!.title, 'أخبار السعودية');
    assert.ok(results[0]!.snippet.includes('آخر الأخبار'));
    assert.equal(results[1]!.url, 'https://second.example/page');
  });

  it('يحترم الحد الأقصى', () => {
    assert.equal(parseDuckDuckGo(sample, 1).length, 1);
  });

  it('ما ينهار على HTML فاضي أو تالف', () => {
    assert.deepEqual(parseDuckDuckGo('', 5), []);
    assert.deepEqual(parseDuckDuckGo('<html>بلا نتائج</html>', 5), []);
  });
});

describe('تحليل نتائج SearxNG', () => {
  it('يقرأ النتائج', () => {
    const results = parseSearxng(
      {
        results: [
          { url: 'https://a.example', title: 'الأول', content: 'وصف' },
          { url: 'https://b.example', title: 'الثاني', content: '' },
        ],
      },
      10,
    );
    assert.equal(results.length, 2);
    assert.equal(results[0]!.title, 'الأول');
  });

  it('يتجاهل النتائج الناقصة', () => {
    const results = parseSearxng(
      { results: [{ url: 'https://a.example' }, { title: 'بلا رابط' }, 'نص'] },
      10,
    );
    assert.equal(results.length, 0);
  });

  it('ما ينهار على رد غير متوقع', () => {
    assert.deepEqual(parseSearxng(null, 5), []);
    assert.deepEqual(parseSearxng('نص', 5), []);
    assert.deepEqual(parseSearxng({}, 5), []);
  });
});

describe('حماية من طلبات الشبكة الداخلية', () => {
  it('يرفض العناوين المحلية', () => {
    assert.equal(isPrivateHost('localhost'), true);
    assert.equal(isPrivateHost('127.0.0.1'), true);
    assert.equal(isPrivateHost('::1'), true);
  });

  it('يرفض الشبكات الخاصة', () => {
    assert.equal(isPrivateHost('10.0.0.5'), true);
    assert.equal(isPrivateHost('192.168.1.1'), true);
    assert.equal(isPrivateHost('172.16.0.1'), true);
    assert.equal(isPrivateHost('172.31.255.255'), true);
    assert.equal(isPrivateHost('169.254.169.254'), true, 'عنوان بيانات السحابة');
  });

  it('يقبل العناوين العامة', () => {
    assert.equal(isPrivateHost('example.com'), false);
    assert.equal(isPrivateHost('8.8.8.8'), false);
    assert.equal(isPrivateHost('172.32.0.1'), false, 'خارج نطاق 172.16-31');
  });
});

describe('قرار البحث التلقائي', () => {
  it('يبحث للأسئلة الوقتية', () => {
    assert.equal(needsSearch('وش آخر أخبار التقنية؟'), true);
    assert.equal(needsSearch('كم سعر الذهب اليوم'), true);
    assert.equal(needsSearch('وش أحدث إصدار من نود'), true);
    assert.equal(needsSearch('ابحث لي عن أفضل مطعم'), true);
  });

  it('ما يبحث للأسئلة العامة', () => {
    assert.equal(needsSearch('اشرح لي وش الفرق بين let وconst'), false);
    assert.equal(needsSearch('اكتب لي دالة تجمع رقمين'), false);
    assert.equal(needsSearch('كيفك'), false);
  });

  it('يتعامل مع اختلاف الهمزات', () => {
    assert.equal(needsSearch('وش اخر الاخبار'), true);
    assert.equal(needsSearch('وش آخر الأخبار'), true);
  });

  it('يبحث لما السنة الحالية مذكورة', () => {
    const year = new Date().getFullYear();
    assert.equal(needsSearch(`وش صار في ${year}`), true);
  });
});
