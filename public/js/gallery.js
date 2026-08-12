/* ===== المعرض العام ===== */
const $ = (s) => document.querySelector(s);
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'toast'; setTimeout(() => t.classList.add('hidden'), 2200); }
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function load() {
  const r = await fetch('/api/gallery');
  const { items } = await r.json();
  const grid = $('#gallery-grid');
  if (!items.length) { $('#gallery-empty').classList.remove('hidden'); return; }
  grid.innerHTML = '';
  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'gitem';
    const preview = item.book.entries.map((e, i) => {
      if (e.type === 'text') return `<div class="gtext">${escapeHtml(e.text || '')}</div>`;
      return `<canvas id="g_${item.id}_${i}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}"></canvas>`;
    }).join('');
    el.innerHTML = `
      <div class="gtitle">📖 كتاب ${escapeHtml(item.ownerName)}</div>
      <div class="gpreview">${preview}</div>
      <div class="gfoot"><span>من غرفة ${escapeHtml(item.roomCode)}</span><button class="btn btn-ghost btn-sm" data-vote>👍 ${item.votes}</button></div>
    `;
    el.querySelector('[data-vote]').onclick = async (e) => {
      const r2 = await fetch(`/api/gallery/${item.id}/vote`, { method: 'POST' });
      const { votes } = await r2.json();
      e.target.textContent = `👍 ${votes}`;
      toast('شكرًا لتصويتك!');
    };
    grid.appendChild(el);
    item.book.entries.forEach((e, i) => {
      if (e.type === 'drawing') {
        const cv = document.getElementById(`g_${item.id}_${i}`);
        if (cv) window.renderStrokes(cv.getContext('2d'), e.strokes || []);
      }
    });
  });
}
window.addEventListener('DOMContentLoaded', load);
