/**
 * قوالب التصميم الجاهزة في استوديو احسمها.
 * كلها HTML/CSS خالص — تُرسم محليًا، وتدعم العربي بشكل كامل.
 */

export interface Palette {
  id: string;
  label: string;
  bg: string;
  fg: string;
  accent: string;
  muted: string;
}

export const PALETTES: Palette[] = [
  { id: 'najd', label: 'نجد', bg: 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)', fg: '#f5f5f5', accent: '#e94560', muted: 'rgba(245,245,245,.65)' },
  { id: 'sahara', label: 'صحراء', bg: 'linear-gradient(135deg,#f8b500,#fceabb)', fg: '#3d2c00', accent: '#c1440e', muted: 'rgba(61,44,0,.7)' },
  { id: 'palm', label: 'نخيل', bg: 'linear-gradient(135deg,#0b3d2e,#145c43,#1f7a5c)', fg: '#eafaf1', accent: '#f4d35e', muted: 'rgba(234,250,241,.7)' },
  { id: 'night', label: 'ليل', bg: 'linear-gradient(135deg,#0f2027,#203a43,#2c5364)', fg: '#ffffff', accent: '#64d2ff', muted: 'rgba(255,255,255,.65)' },
  { id: 'rose', label: 'ورد', bg: 'linear-gradient(135deg,#3d0c11,#7b2233,#b5384f)', fg: '#fff5f6', accent: '#ffd6a5', muted: 'rgba(255,245,246,.7)' },
  { id: 'clean', label: 'أبيض نظيف', bg: '#ffffff', fg: '#111418', accent: '#158259', muted: 'rgba(17,20,24,.6)' },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export interface ImageTemplate {
  id: string;
  label: string;
  note: string;
  width: number;
  height: number;
  fields: { key: string; label: string; multiline?: boolean; optional?: boolean }[];
}

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  {
    id: 'social',
    label: 'منشور سوشيال',
    note: 'مربع 1080×1080 — مناسب لإنستقرام وتويتر',
    width: 1080,
    height: 1080,
    fields: [
      { key: 'title', label: 'العنوان', multiline: true },
      { key: 'subtitle', label: 'السطر الثاني', optional: true },
      { key: 'badge', label: 'شارة صغيرة', optional: true },
    ],
  },
  {
    id: 'cover',
    label: 'غلاف عريض',
    note: '1200×630 — لمشاركة الروابط والمقالات',
    width: 1200,
    height: 630,
    fields: [
      { key: 'title', label: 'العنوان', multiline: true },
      { key: 'subtitle', label: 'الوصف', optional: true },
      { key: 'badge', label: 'شارة صغيرة', optional: true },
    ],
  },
  {
    id: 'quote',
    label: 'اقتباس',
    note: 'بطاقة اقتباس أنيقة',
    width: 1080,
    height: 1080,
    fields: [
      { key: 'title', label: 'نص الاقتباس', multiline: true },
      { key: 'subtitle', label: 'القائل', optional: true },
    ],
  },
  {
    id: 'story',
    label: 'ستوري',
    note: '1080×1920 — عمودي للستوريز',
    width: 1080,
    height: 1920,
    fields: [
      { key: 'title', label: 'العنوان', multiline: true },
      { key: 'subtitle', label: 'السطر الثاني', optional: true },
      { key: 'badge', label: 'شارة صغيرة', optional: true },
    ],
  },
  {
    id: 'poster',
    label: 'بوستر',
    note: 'A4 عمودي بدقة طباعة',
    width: 1240,
    height: 1754,
    fields: [
      { key: 'title', label: 'العنوان', multiline: true },
      { key: 'subtitle', label: 'التفاصيل', multiline: true, optional: true },
      { key: 'badge', label: 'شارة صغيرة', optional: true },
    ],
  },
];

export function imageTemplateById(id: string): ImageTemplate | undefined {
  return IMAGE_TEMPLATES.find((t) => t.id === id);
}

/**
 * يهرب قيمة قبل حقنها داخل كتلة <script>.
 *
 * JSON.stringify لحاله ما يكفي: ما يهرب "</script>" فيقدر النص
 * يقفل الكتلة ويحقن كودًا. نهرب < و> وفواصل الأسطر اليونيكودية.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** يهرب النص قبل حقنه في HTML — ما نثق بأي مدخل. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ImageSpec {
  template: string;
  palette: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

/** يبني HTML لقالب صورة. */
export function buildImageHtml(spec: ImageSpec): { html: string; width: number; height: number } {
  const template = imageTemplateById(spec.template) ?? IMAGE_TEMPLATES[0]!;
  const palette = paletteById(spec.palette);

  const title = escapeHtml(spec.title.trim());
  const subtitle = spec.subtitle?.trim() ? escapeHtml(spec.subtitle.trim()) : '';
  const badge = spec.badge?.trim() ? escapeHtml(spec.badge.trim()) : '';

  // حجم الخط يتناسب مع طول النص وأبعاد القالب
  const base = Math.min(template.width, template.height);
  const titleSize = Math.round(
    Math.max(base * 0.055, Math.min(base * 0.13, (base * 2.6) / Math.max(title.length, 8))),
  );
  const subtitleSize = Math.round(titleSize * 0.42);
  const badgeSize = Math.round(titleSize * 0.28);
  const pad = Math.round(base * 0.09);

  if (template.id === 'quote') {
    return {
      width: template.width,
      height: template.height,
      html: `
<div style="width:100%;height:100%;background:${palette.bg};color:${palette.fg};
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:${pad}px;text-align:center;gap:${Math.round(titleSize * 0.5)}px">
  <div style="font-size:${Math.round(titleSize * 1.6)}px;color:${palette.accent};
    line-height:.6;font-weight:900">”</div>
  <div style="font-size:${titleSize}px;font-weight:700;line-height:1.5;max-width:88%">${title}</div>
  ${subtitle ? `<div style="font-size:${subtitleSize}px;color:${palette.muted};
    margin-top:${Math.round(titleSize * 0.3)}px">— ${subtitle}</div>` : ''}
  <div style="position:absolute;bottom:${pad}px;font-size:${badgeSize}px;
    color:${palette.muted};opacity:.7">احسمها</div>
</div>`,
    };
  }

  const align = template.id === 'poster' || template.id === 'story' ? 'flex-start' : 'center';
  const textAlign = align === 'center' ? 'center' : 'right';

  return {
    width: template.width,
    height: template.height,
    html: `
<div style="width:100%;height:100%;background:${palette.bg};color:${palette.fg};
  display:flex;flex-direction:column;justify-content:center;align-items:${align};
  padding:${pad}px;text-align:${textAlign};gap:${Math.round(titleSize * 0.35)}px;
  position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;
    background:radial-gradient(circle at 80% 12%, ${palette.accent}22, transparent 55%)"></div>

  ${badge ? `<div style="position:relative;font-size:${badgeSize}px;font-weight:800;
    letter-spacing:.03em;padding:${Math.round(badgeSize * 0.5)}px ${Math.round(badgeSize * 1.1)}px;
    border-radius:999px;background:${palette.accent};color:${palette.bg.startsWith('#fff') ? '#fff' : palette.fg};
    align-self:${align === 'center' ? 'center' : 'flex-start'}">${badge}</div>` : ''}

  <div style="position:relative;font-size:${titleSize}px;font-weight:900;
    line-height:1.25;max-width:94%">${title}</div>

  ${subtitle ? `<div style="position:relative;font-size:${subtitleSize}px;
    color:${palette.muted};line-height:1.6;max-width:88%">${subtitle}</div>` : ''}

  <div style="position:absolute;bottom:${pad}px;${align === 'center' ? 'left:0;right:0;' : `right:${pad}px;`}
    font-size:${badgeSize}px;color:${palette.muted};opacity:.6;
    text-align:${align === 'center' ? 'center' : 'right'}">احسمها</div>
</div>`,
  };
}

// ───────────────────────── قوالب الموشن ─────────────────────────

export interface MotionTemplate {
  id: string;
  label: string;
  note: string;
  defaultDuration: number;
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
  { id: 'title-reveal', label: 'ظهور عنوان', note: 'العنوان يطلع حرفًا بحرف مع خط متحرك', defaultDuration: 4 },
  { id: 'intro', label: 'مقدمة', note: 'شعار يكبر مع عنوان — مناسب لبداية فيديو', defaultDuration: 5 },
  { id: 'outro', label: 'خاتمة', note: 'دعوة لإجراء مع تلاشي', defaultDuration: 4 },
  { id: 'kinetic', label: 'نص حركي', note: 'كلمات تتوالى بإيقاع', defaultDuration: 6 },
];

export function motionTemplateById(id: string): MotionTemplate | undefined {
  return MOTION_TEMPLATES.find((t) => t.id === id);
}

export interface MotionSpec {
  template: string;
  palette: string;
  title: string;
  subtitle?: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

/**
 * يبني صفحة أنيميشن تعرّف seek(t) — كل إطار يُحسب من الوقت مباشرة،
 * فالنتيجة حتمية ومطابقة تمامًا في كل مرة.
 */
export function buildMotionHtml(spec: MotionSpec): string {
  const palette = paletteById(spec.palette);
  const title = escapeHtml(spec.title.trim());
  const subtitle = spec.subtitle?.trim() ? escapeHtml(spec.subtitle.trim()) : '';
  const base = Math.min(spec.width, spec.height);
  const titleSize = Math.round(
    Math.max(base * 0.06, Math.min(base * 0.14, (base * 2.4) / Math.max(title.length, 8))),
  );
  const subtitleSize = Math.round(titleSize * 0.4);
  const duration = spec.durationSec;

  const scene = `
<div id="stage" style="width:100%;height:100%;background:${palette.bg};color:${palette.fg};
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:${Math.round(titleSize * 0.3)}px;position:relative;overflow:hidden">
  <div id="glow" style="position:absolute;inset:0;
    background:radial-gradient(circle at 50% 45%, ${palette.accent}33, transparent 60%)"></div>
  <div id="mark" style="position:relative;width:${Math.round(base * 0.16)}px;
    height:${Math.round(base * 0.16)}px;border-radius:${Math.round(base * 0.04)}px;
    background:${palette.accent};display:flex;align-items:center;justify-content:center;
    font-size:${Math.round(base * 0.08)}px;font-weight:900;color:${palette.fg}">ح</div>
  <div id="title" style="position:relative;font-size:${titleSize}px;font-weight:900;
    line-height:1.25;text-align:center;max-width:88%"></div>
  <div id="sub" style="position:relative;font-size:${subtitleSize}px;color:${palette.muted};
    text-align:center;max-width:80%">${subtitle}</div>
</div>`;

  const script = `
<script>
const DURATION = ${duration};
const TITLE = ${jsonForScript(spec.title.trim())};
const TEMPLATE = ${jsonForScript(spec.template)};

const stage = document.getElementById('stage');
const mark = document.getElementById('mark');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const glow = document.getElementById('glow');

const clamp = (v) => Math.max(0, Math.min(1, v));
/** تسارع ناعم — بداية سريعة ونهاية هادئة */
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => (clamp(t) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function seek(t) {
  const p = clamp(t / DURATION);

  if (TEMPLATE === 'title-reveal') {
    const typed = Math.floor(easeOut(p / 0.6) * TITLE.length);
    titleEl.textContent = TITLE.slice(0, typed);
    mark.style.opacity = String(easeOut(p / 0.15));
    mark.style.transform = 'scale(' + (0.6 + 0.4 * easeOut(p / 0.2)) + ')';
    subEl.style.opacity = String(easeOut((p - 0.6) / 0.25));
    glow.style.opacity = String(0.4 + 0.6 * Math.sin(p * Math.PI));
  } else if (TEMPLATE === 'intro') {
    const grow = easeOut(p / 0.35);
    mark.style.transform = 'scale(' + (0.2 + 0.8 * grow) + ') rotate(' + (1 - grow) * -25 + 'deg)';
    mark.style.opacity = String(grow);
    titleEl.textContent = TITLE;
    titleEl.style.opacity = String(easeOut((p - 0.3) / 0.3));
    titleEl.style.transform = 'translateY(' + (1 - easeOut((p - 0.3) / 0.3)) * 40 + 'px)';
    subEl.style.opacity = String(easeOut((p - 0.55) / 0.3));
    glow.style.opacity = String(easeInOut(p));
  } else if (TEMPLATE === 'outro') {
    titleEl.textContent = TITLE;
    const enter = easeOut(p / 0.3);
    const exit = 1 - easeOut((p - 0.75) / 0.25);
    titleEl.style.opacity = String(enter * exit);
    titleEl.style.transform = 'scale(' + (0.9 + 0.1 * enter) + ')';
    subEl.style.opacity = String(easeOut((p - 0.2) / 0.3) * exit);
    mark.style.opacity = String(enter * exit);
    stage.style.opacity = String(exit);
  } else {
    // نص حركي: الكلمات تتوالى
    const words = TITLE.split(/\\s+/).filter(Boolean);
    const per = 1 / Math.max(words.length, 1);
    const index = Math.min(words.length - 1, Math.floor(p / per));
    const local = (p - index * per) / per;
    titleEl.textContent = words[index] ?? '';
    titleEl.style.opacity = String(Math.sin(clamp(local) * Math.PI));
    titleEl.style.transform = 'scale(' + (0.85 + 0.15 * easeOut(local)) + ')';
    mark.style.opacity = '0.9';
    subEl.style.opacity = String(easeOut((p - 0.8) / 0.2));
    glow.style.opacity = String(0.5 + 0.5 * Math.sin(p * Math.PI * 2));
  }
}

window.seek = seek;
seek(0);
</script>`;

  return scene + script;
}
