import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  IMAGE_TEMPLATES,
  MOTION_TEMPLATES,
  PALETTES,
  buildImageHtml,
  buildMotionHtml,
  escapeHtml,
  imageTemplateById,
  motionTemplateById,
  paletteById,
} from './templates.service.js';

describe('القوالب والألوان', () => {
  it('كل القوالب لها معرّفات فريدة', () => {
    const ids = IMAGE_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    const motionIds = MOTION_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(motionIds).size, motionIds.length);
  });

  it('كل القوالب لها أبعاد صالحة', () => {
    for (const template of IMAGE_TEMPLATES) {
      assert.ok(template.width >= 64 && template.width <= 4096, template.id);
      assert.ok(template.height >= 64 && template.height <= 4096, template.id);
    }
  });

  it('البحث بالمعرّف يشتغل', () => {
    assert.equal(imageTemplateById('cover')?.id, 'cover');
    assert.equal(imageTemplateById('غير-موجود'), undefined);
    assert.equal(motionTemplateById('intro')?.id, 'intro');
  });

  it('الألوان ترجع افتراضيًا للأول', () => {
    assert.equal(paletteById('najd').id, 'najd');
    assert.equal(paletteById('غير-موجود').id, PALETTES[0]!.id);
  });
});

describe('تهريب النص', () => {
  it('يهرب محارف HTML', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
    assert.equal(escapeHtml('"x"'), '&quot;x&quot;');
  });

  it('يمنع حقن HTML في القوالب', () => {
    const { html } = buildImageHtml({
      template: 'cover',
      palette: 'night',
      title: '<img src=x onerror=alert(1)>',
      subtitle: '</div><script>evil()</script>',
    });
    // ما نبي أي وسم فعلي من مدخلات المستخدم — النص المهرَّب غير ضار
    assert.ok(!html.includes('<img src=x'), 'وسم img فعلي');
    assert.ok(!html.includes('<script>evil'), 'كتلة سكربت فعلية');
    assert.ok(html.includes('&lt;img'), 'المدخل ظاهر كنص مهرَّب');
    assert.ok(html.includes('&lt;script&gt;evil'), 'السكربت ظاهر كنص مهرَّب');
  });
});

describe('بناء HTML الصور', () => {
  it('يرجع الأبعاد الصحيحة للقالب', () => {
    const result = buildImageHtml({ template: 'story', palette: 'najd', title: 'عنوان' });
    assert.equal(result.width, 1080);
    assert.equal(result.height, 1920);
  });

  it('يستخدم القالب الأول إذا المعرّف غلط', () => {
    const result = buildImageHtml({ template: 'مجهول', palette: 'najd', title: 'عنوان' });
    assert.equal(result.width, IMAGE_TEMPLATES[0]!.width);
  });

  it('يحط العنوان في المخرجات', () => {
    const { html } = buildImageHtml({ template: 'cover', palette: 'palm', title: 'مرحبا بالعالم' });
    assert.ok(html.includes('مرحبا بالعالم'));
  });

  it('يتجاهل الحقول الاختيارية الفاضية', () => {
    const { html } = buildImageHtml({
      template: 'cover',
      palette: 'palm',
      title: 'عنوان',
      subtitle: '   ',
      badge: '',
    });
    // ما فيه عنصر شارة لو ما فيه نص
    assert.ok(!html.includes('border-radius:999px'));
  });

  it('يقلّص حجم الخط للعناوين الطويلة', () => {
    const short = buildImageHtml({ template: 'cover', palette: 'palm', title: 'قصير' }).html;
    const long = buildImageHtml({
      template: 'cover',
      palette: 'palm',
      title: 'عنوان طويل جدًا '.repeat(12),
    }).html;

    const size = (html: string): number =>
      Number(html.match(/font-size:(\d+)px;font-weight:900/)?.[1] ?? 0);
    assert.ok(size(long) < size(short), `الطويل ${size(long)} لازم أصغر من القصير ${size(short)}`);
  });

  it('قالب الاقتباس مختلف عن البقية', () => {
    const quote = buildImageHtml({ template: 'quote', palette: 'rose', title: 'حكمة' }).html;
    assert.ok(quote.includes('”'));
  });
});

describe('بناء HTML الموشن', () => {
  const spec = {
    template: 'intro',
    palette: 'night',
    title: 'احسمها',
    subtitle: 'وصف',
    durationSec: 4,
    width: 960,
    height: 540,
    fps: 24,
  };

  it('يعرّف دالة seek عالمية', () => {
    const html = buildMotionHtml(spec);
    assert.ok(html.includes('window.seek = seek'));
    assert.ok(html.includes('function seek(t)'));
  });

  it('يحقن المدة والعنوان بأمان', () => {
    const html = buildMotionHtml({ ...spec, title: 'نص "فيه" علامات' });
    assert.ok(html.includes('const DURATION = 4'));
    assert.ok(html.includes('\\"فيه\\"'), 'علامات التنصيص تنهرب');
  });

  it('يمنع كسر كتلة السكربت عبر العنوان', () => {
    const html = buildMotionHtml({ ...spec, title: '</script><script>evil()</script>' });
    // ما ينفع يظهر أي </script> خام داخل تعريف العنوان
    const scriptStart = html.indexOf('const TITLE =');
    const line = html.slice(scriptStart, html.indexOf('\n', scriptStart));
    assert.ok(!line.includes('</script>'), 'العنوان يقدر يقفل كتلة السكربت');
    assert.ok(line.includes('u003C'), 'علامات أقل من لازم تنهرب');
  });

  it('يهرب فواصل الأسطر اليونيكودية', () => {
    const html = buildMotionHtml({ ...spec, title: 'أ\u2028ب' });
    assert.ok(html.includes('u2028'), 'U+2028 يكسر جافاسكربت لو ما انهرب');
  });

  it('يغطي كل قوالب الموشن', () => {
    for (const template of MOTION_TEMPLATES) {
      const html = buildMotionHtml({ ...spec, template: template.id });
      assert.ok(html.includes('window.seek = seek'), template.id);
      assert.ok(html.includes('seek(0)'), template.id);
    }
  });

  it('يستدعي seek(0) عشان الإطار الأول يكون صحيحًا', () => {
    assert.ok(buildMotionHtml(spec).trimEnd().includes('seek(0);'));
  });
});
