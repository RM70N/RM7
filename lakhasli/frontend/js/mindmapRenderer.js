// يعتمد على markmap-lib + markmap-view المحمّلتين عالميًا (window.markmap) عبر <script>
// بصفحة mindmap.html، فوق d3 (window.d3) — الترتيب مهم لأن markmap-view يقرأ d3 عالميًا
// وقت التحميل. البيانات: شجرة {title, children} (من مخرجات Gemini JSON) تُحوَّل إلى
// Markdown هرمي ثم إلى شجرة IPureNode عبر markmap-lib Transformer، وتُعرض عبر Markmap.

function escapeInline(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([*_`[\]])/g, '\\$1');
}

function nodeActionsHtml(path) {
  const p = path.join(',');
  return `<span class="mm-actions"><button type="button" class="mm-expand" data-path="${p}" data-action="clarify">وضّح أكثر</button><button type="button" class="mm-expand" data-path="${p}" data-action="example">مثال</button></span>`;
}

/**
 * يحوّل شجرة {title, children} إلى نص Markdown هرمي (عنوان رئيسي + قائمة متداخلة)
 * — هذا هو الشكل القياسي اللي يفهمه markmap لبناء خريطة ذهنية من Markdown.
 * كل فرع (عدا الجذر) يحمل أزرار "وضّح أكثر"/"مثال" مع data-path لتحديد موقعه بالشجرة.
 * @param {{title: string, children?: Array}} tree
 */
export function treeToMarkdown(tree) {
  const lines = [`# ${escapeInline(tree.title)}`];

  function walk(node, path, depth) {
    (node.children || []).forEach((child, i) => {
      const childPath = [...path, i];
      const indent = '  '.repeat(depth - 1);
      lines.push(`${indent}- ${escapeInline(child.title)} ${nodeActionsHtml(childPath)}`);
      walk(child, childPath, depth + 1);
    });
  }

  walk(tree, [], 1);
  return lines.join('\n');
}

let transformer = null;
function getTransformer() {
  if (!transformer) transformer = new window.markmap.Transformer();
  return transformer;
}

/**
 * يرسم الخريطة الذهنية أول مرة داخل عنصر <svg>.
 * @param {SVGElement} svgEl
 * @param {object} tree
 * @returns {InstanceType<typeof window.markmap.Markmap>}
 */
export function renderMindmap(svgEl, tree) {
  const { root } = getTransformer().transform(treeToMarkdown(tree));
  return window.markmap.Markmap.create(svgEl, { duration: 300, maxWidth: 320 }, root);
}

/**
 * يعيد رسم الخريطة بعد تعديل الشجرة (مثلاً بعد إضافة فروع جديدة) دون إعادة تحميل الصفحة.
 * @param {InstanceType<typeof window.markmap.Markmap>} mm
 * @param {object} tree
 */
export async function updateMindmap(mm, tree) {
  const { root } = getTransformer().transform(treeToMarkdown(tree));
  await mm.setData(root);
  mm.fit();
}

/**
 * يوجد الفرع بالشجرة حسب مساره (مصفوفة فهارس بدءًا من الجذر).
 * @param {object} tree
 * @param {number[]} path
 */
export function findNodeByPath(tree, path) {
  let node = tree;
  for (const idx of path) {
    node = node?.children?.[idx];
    if (!node) return null;
  }
  return node;
}
