/* ===== مصدر البث (OBS Browser Source) — عرض للقراءة فقط ===== */
const code = new URLSearchParams(location.search).get('room');
const wrap = document.getElementById('wrap');

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'joinOverlay', code }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'overlayState') render(m.view);
    if (m.type === 'reaction') floatEmoji(m.emoji);
    if (m.type === 'audienceTally') renderTally(m);
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

let lastTally = null;
function renderTally(m) { lastTally = m; }

function render(view) {
  if (!view || !code) { wrap.innerHTML = ''; return; }
  if (view.phase === 'lobby') {
    wrap.innerHTML = `<div class="card"><div class="phase-tag">🎨 رسامين غنام</div><div class="title">غرفة ${view.hostName || ''} — بانتظار البدء (${view.playerCount} لاعبين)</div></div>`;
    return;
  }
  if (view.phase === 'playing') {
    const acting = (view.acting || []).map((a) => `<span class="acting-chip">${a.avatar} ${a.name}</span>`).join('');
    wrap.innerHTML = `
      <div class="card">
        <div class="phase-tag">الجولة ${view.round} من ${view.totalRounds} — ${view.roundType === 'text' ? '✍️ يكتبون' : '🎨 يرسمون'}</div>
        <div class="acting-row">${acting}</div>
      </div>`;
    return;
  }
  if (view.phase === 'reveal') {
    if (view.locked) { wrap.innerHTML = `<div class="card locked-box">🔒 ${view.message || 'قادم...'}</div>`; return; }
    if (view.hidden) { wrap.innerHTML = `<div class="card hidden-box">🙈 ${view.message}</div>`; return; }
    const last = (view.entries || [])[view.entries.length - 1];
    let content = '';
    if (last) {
      if (last.hidden) content = '<div class="hidden-box">🙈 محتوى مخفي من البث</div>';
      else if (last.type === 'text') content = `<div class="entry-text">${escapeHtml(last.text || '')}</div>`;
      else content = `<canvas class="entry-canvas" id="ov-canvas" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}"></canvas>`;
    }
    wrap.innerHTML = `<div class="card"><div class="book-owner">📖 كتاب ${escapeHtml(view.ownerName || '')} — ${view.bookIndex + 1}/${view.totalBooks}</div>${content}</div>`;
    if (last && last.type === 'drawing' && !last.hidden) {
      const cv = document.getElementById('ov-canvas');
      if (cv) window.renderStrokes(cv.getContext('2d'), last.strokes || []);
    }
    return;
  }
  wrap.innerHTML = '';
}

function floatEmoji(emoji) {
  const el = document.createElement('div');
  el.className = 'fe'; el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + '%'; el.style.bottom = '40px';
  document.getElementById('floats').appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

if (code) connect();
else wrap.innerHTML = '<div class="card">رابط غير صالح — لا يوجد رمز غرفة</div>';
