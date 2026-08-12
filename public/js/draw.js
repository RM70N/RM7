/* ===== محرك الرسم لـ"رسامين غنام" ===== */
/* يخزّن الرسم كمسارات متجهية (Vector Strokes) لبثّها بخفّة وإعادة بنائها لدى الجميع */

const LOGICAL_W = 800;
const LOGICAL_H = 600;

// إعادة رسم مجموعة strokes على سياق canvas (تُستخدم في اللعب وفي العرض النهائي)
function renderStrokes(ctx, strokes, w = LOGICAL_W, h = LOGICAL_H) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  for (const s of strokes) applyStroke(ctx, s, w, h);
}

function applyStroke(ctx, s, w, h) {
  ctx.save();
  ctx.globalAlpha = s.opacity ?? 1;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size || 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.tool === 'fill') {
    floodFill(ctx, Math.round(s.point[0]), Math.round(s.point[1]), s.color, w, h);
    ctx.restore();
    return;
  }
  if (s.tool === 'eraser') {
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 1;
  }
  const pts = s.points || [];
  if (s.tool === 'pencil' || s.tool === 'eraser') {
    if (pts.length < 2) {
      if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], (s.size || 4) / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore(); return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  } else if (s.tool === 'line' && pts.length >= 2) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.stroke();
  } else if (s.tool === 'rect' && pts.length >= 2) {
    const x = Math.min(pts[0][0], pts[1][0]), y = Math.min(pts[0][1], pts[1][1]);
    const rw = Math.abs(pts[1][0] - pts[0][0]), rh = Math.abs(pts[1][1] - pts[0][1]);
    if (s.filled) ctx.fillRect(x, y, rw, rh); else ctx.strokeRect(x, y, rw, rh);
  } else if (s.tool === 'circle' && pts.length >= 2) {
    const cx = pts[0][0], cy = pts[0][1];
    const r = Math.hypot(pts[1][0] - cx, pts[1][1] - cy);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (s.filled) ctx.fill(); else ctx.stroke();
  }
  ctx.restore();
}

// تعبئة بالفيضان (Flood Fill)
function floodFill(ctx, x, y, hexColor, w, h) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const target = getPixel(data, x, y, w);
  const fill = hexToRgba(hexColor);
  if (colorsMatch(target, fill, 0)) return;
  const stack = [[x, y]];
  const tol = 32;
  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const cur = getPixel(data, px, py, w);
    if (!colorsMatch(cur, target, tol)) continue;
    setPixel(data, px, py, w, fill);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ctx.putImageData(img, 0, 0);
}
function getPixel(d, x, y, w) { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
function setPixel(d, x, y, w, c) { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
function colorsMatch(a, b, tol) { return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= tol; }
function hexToRgba(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
}

const PALETTE = [
  '#000000', '#7f8c8d', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f',
  '#2ecc71', '#16a085', '#1abc9c', '#3498db', '#2980b9', '#9b59b6',
  '#8e44ad', '#e84393', '#fd79a8', '#a0522d', '#6d4c41', '#00cec9',
];

class DrawEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.strokes = [];
    this.redoStack = [];
    this.tool = 'pencil';
    this.color = '#000000';
    this.size = 6;
    this.opacity = 1;
    this.filled = false;
    this.drawing = false;
    this.current = null;
    this.recentColors = [];
    this.onColorPicked = null;
    this._bind();
    this.clear();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointerleave', (e) => { if (this.drawing) this._move(e); });
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * LOGICAL_W;
    const y = ((e.clientY - r.top) / r.height) * LOGICAL_H;
    return [Math.max(0, Math.min(LOGICAL_W, x)), Math.max(0, Math.min(LOGICAL_H, y))];
  }

  _down(e) {
    e.preventDefault();
    const p = this._pos(e);
    if (this.tool === 'eyedropper') { this._pick(p); return; }
    if (this.tool === 'fill') {
      const s = { tool: 'fill', color: this.color, point: p };
      this.strokes.push(s); this.redoStack = []; this._redraw(); return;
    }
    this.drawing = true;
    this.current = { tool: this.tool, color: this.color, size: this.size, opacity: this.opacity, filled: this.filled, points: [p] };
  }

  _move(e) {
    if (!this.drawing || !this.current) return;
    e.preventDefault();
    const p = this._pos(e);
    if (['line', 'rect', 'circle'].includes(this.tool)) {
      this.current.points[1] = p;
    } else {
      this.current.points.push(p);
    }
    this._redraw(this.current);
  }

  _up() {
    if (!this.drawing || !this.current) return;
    this.drawing = false;
    if (this.current.points.length) { this.strokes.push(this.current); this.redoStack = []; this._addRecent(this.color); }
    this.current = null;
    this._redraw();
  }

  _pick(p) {
    const d = this.ctx.getImageData(Math.round(p[0]), Math.round(p[1]), 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    this.color = hex;
    this.tool = 'pencil';
    if (this.onColorPicked) this.onColorPicked(hex);
  }

  _addRecent(c) {
    if (this.recentColors[0] === c) return;
    this.recentColors = [c, ...this.recentColors.filter((x) => x !== c)].slice(0, 6);
  }

  _redraw(preview) {
    renderStrokes(this.ctx, this.strokes);
    if (preview) applyStroke(this.ctx, preview, LOGICAL_W, LOGICAL_H);
  }

  clear() { this.strokes = []; this.redoStack = []; this._redraw(); }
  undo() { if (this.strokes.length) { this.redoStack.push(this.strokes.pop()); this._redraw(); } }
  redo() { if (this.redoStack.length) { this.strokes.push(this.redoStack.pop()); this._redraw(); } }
  getStrokes() { return this.strokes; }
  setColor(c) { this.color = c; }
  setTool(t) { this.tool = t; }
  setSize(s) { this.size = s; }
  setOpacity(o) { this.opacity = o; }
  exportPNG() { return this.canvas.toDataURL('image/png'); }
}

window.DrawEngine = DrawEngine;
window.renderStrokes = renderStrokes;
window.DRAW_PALETTE = PALETTE;
window.LOGICAL_W = LOGICAL_W;
window.LOGICAL_H = LOGICAL_H;
