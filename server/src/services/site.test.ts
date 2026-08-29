import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { isTextFile, mimeFor, safeEntryPath, slugify, stripCommonRoot } from './site.service.js';
import { buildDiff, diffStats, parseEditResponse } from './site-agent.service.js';

describe('أمان مسارات الأرشيف', () => {
  it('يقبل المسارات العادية', () => {
    assert.equal(safeEntryPath('index.html'), 'index.html');
    assert.equal(safeEntryPath('css/style.css'), 'css/style.css');
    assert.equal(safeEntryPath('a/b/c/d.js'), 'a/b/c/d.js');
  });

  it('يرفض الصعود خارج المجلد', () => {
    assert.equal(safeEntryPath('../evil.txt'), null);
    assert.equal(safeEntryPath('../../../../etc/passwd'), null);
    assert.equal(safeEntryPath('a/../../evil.txt'), null);
  });

  it('يرفض المسارات المطلقة', () => {
    assert.equal(safeEntryPath('/etc/passwd'), null);
    assert.equal(safeEntryPath('C:/windows/system32'), null);
    assert.equal(safeEntryPath('D:\\data\\file.txt'), null);
  });

  it('يرفض المحارف الصفرية', () => {
    assert.equal(safeEntryPath('file\0.txt'), null);
  });

  it('يحوّل فواصل ويندوز', () => {
    assert.equal(safeEntryPath('css\\style.css'), 'css/style.css');
  });

  it('يرفض المسار الفاضي', () => {
    assert.equal(safeEntryPath(''), null);
    assert.equal(safeEntryPath('.'), null);
    assert.equal(safeEntryPath('./'), null);
  });

  it('ينظّف البادئة النسبية', () => {
    assert.equal(safeEntryPath('./index.html'), 'index.html');
  });
});

describe('الجذر المشترك', () => {
  it('يكتشف مجلد الجذر الواحد', () => {
    assert.equal(
      stripCommonRoot(['my-site/index.html', 'my-site/css/a.css', 'my-site/js/b.js']),
      'my-site/',
    );
  });

  it('ما يشيل شي إذا فيه ملفات في الجذر', () => {
    assert.equal(stripCommonRoot(['index.html', 'css/a.css']), '');
  });

  it('ما يشيل شي إذا فيه أكثر من مجلد جذر', () => {
    assert.equal(stripCommonRoot(['a/index.html', 'b/style.css']), '');
  });

  it('يتعامل مع القائمة الفاضية', () => {
    assert.equal(stripCommonRoot([]), '');
  });
});

describe('تصنيف الملفات', () => {
  it('يعرف الملفات النصية', () => {
    assert.equal(isTextFile('index.html'), true);
    assert.equal(isTextFile('a/b/style.scss'), true);
    assert.equal(isTextFile('app.tsx'), true);
    assert.equal(isTextFile('README'), true);
  });

  it('يعرف الملفات الثنائية', () => {
    assert.equal(isTextFile('logo.png'), false);
    assert.equal(isTextFile('video.mp4'), false);
    assert.equal(isTextFile('font.woff2'), false);
  });

  it('يعطي نوع المحتوى الصحيح', () => {
    assert.equal(mimeFor('index.html'), 'text/html');
    assert.equal(mimeFor('style.css'), 'text/css');
    assert.equal(mimeFor('app.js'), 'text/javascript');
    assert.equal(mimeFor('logo.png'), 'image/png');
    assert.equal(mimeFor('unknown.xyz'), 'application/octet-stream');
  });
});

describe('المعرّف المختصر', () => {
  it('يبني معرّفًا آمنًا من اسم عربي', () => {
    const slug = slugify('متجر التمور.zip');
    assert.ok(!slug.includes(' '));
    assert.ok(!slug.includes('.'));
    assert.ok(slug.includes('متجر'));
  });

  it('يضيف لاحقة عشوائية عشان ما يتكرر', () => {
    assert.notEqual(slugify('site'), slugify('site'));
  });

  it('يتعامل مع اسم بلا حروف صالحة', () => {
    assert.ok(slugify('!!!.zip').startsWith('site-'));
  });
});

describe('تحليل رد التعديل', () => {
  it('يقرأ الملخص وكتل الملفات', () => {
    const raw = `### ملخص
غيّرت لون الخلفية وزدت زر.

### الملفات
<<<FILE: index.html>>>
<h1>مرحبا</h1>
<<<END>>>

<<<FILE: css/style.css>>>
body { background: #000; }
<<<END>>>`;

    const { summary, edits } = parseEditResponse(raw);
    assert.ok(summary.includes('غيّرت'));
    assert.equal(edits.length, 2);
    assert.equal(edits[0]!.relPath, 'index.html');
    assert.ok(edits[0]!.content!.includes('مرحبا'));
    assert.equal(edits[1]!.relPath, 'css/style.css');
  });

  it('يقرأ كتل الحذف', () => {
    const { edits } = parseEditResponse('### ملخص\nشلت ملف.\n<<<DELETE: old.js>>>');
    assert.equal(edits.length, 1);
    assert.equal(edits[0]!.action, 'delete');
    assert.equal(edits[0]!.relPath, 'old.js');
  });

  it('يشيل تغليف الماركداون من داخل الكتلة', () => {
    const raw = '<<<FILE: a.js>>>\n```js\nconst x = 1;\n```\n<<<END>>>';
    const { edits } = parseEditResponse(raw);
    assert.ok(!edits[0]!.content!.includes('```'));
    assert.ok(edits[0]!.content!.includes('const x = 1;'));
  });

  it('يرجع فاضي لرد بلا كتل', () => {
    const { edits, summary } = parseEditResponse('### ملخص\nما فيه شي يحتاج تعديل.');
    assert.equal(edits.length, 0);
    assert.ok(summary.includes('ما فيه'));
  });

  it('ما ينهار على رد تالف', () => {
    assert.equal(parseEditResponse('كلام عشوائي t392 t415').edits.length, 0);
    assert.equal(parseEditResponse('').edits.length, 0);
    assert.equal(parseEditResponse('<<<FILE: بدون نهاية>>>\nمحتوى').edits.length, 0);
  });

  it('يتحمّل مسافات زايدة حول المسار', () => {
    const { edits } = parseEditResponse('<<<FILE:   spaced.html   >>>\nمحتوى\n<<<END>>>');
    assert.equal(edits[0]!.relPath, 'spaced.html');
  });
});

describe('حساب الفروق', () => {
  it('يكتشف الأسطر المضافة', () => {
    const lines = buildDiff('a\nb', 'a\nb\nc');
    assert.deepEqual(diffStats(lines), { added: 1, removed: 0 });
  });

  it('يكتشف الأسطر المحذوفة', () => {
    const lines = buildDiff('a\nb\nc', 'a\nc');
    assert.deepEqual(diffStats(lines), { added: 0, removed: 1 });
  });

  it('يكتشف التعديل كحذف وإضافة', () => {
    const lines = buildDiff('لون احمر', 'لون ازرق');
    assert.deepEqual(diffStats(lines), { added: 1, removed: 1 });
  });

  it('ما يعطي فرقًا للنص المتطابق', () => {
    const lines = buildDiff('نفس\nالنص', 'نفس\nالنص');
    assert.deepEqual(diffStats(lines), { added: 0, removed: 0 });
    assert.ok(lines.every((l) => l.kind === 'same'));
  });

  it('يتعامل مع ملف جديد', () => {
    assert.deepEqual(diffStats(buildDiff(null, 'سطر\nسطر')), { added: 2, removed: 0 });
  });

  it('يتعامل مع ملف محذوف', () => {
    assert.deepEqual(diffStats(buildDiff('سطر\nسطر', null)), { added: 0, removed: 2 });
  });
});
