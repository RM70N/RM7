/* ===== صفحة تصويت الجمهور ===== */
const $ = (s) => document.querySelector(s);
const code = new URLSearchParams(location.search).get('room');
let ws = null;
let books = null;
let myVote = null;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'toast'; setTimeout(() => t.classList.add('hidden'), 2200); }

function connect() {
  ws = new WebSocket(window.ghannamWsUrl());
  ws.onopen = () => {
    const name = $('#aud-name').value.trim() || 'مشاهد';
    ws.send(JSON.stringify({ type: 'joinAudience', code, name }));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'error') { toast(m.message); return; }
    if (m.type === 'audienceJoined') {
      $('#aud-join').classList.add('hidden');
      $('#aud-vote').classList.remove('hidden');
      if (m.room.state !== 'reveal') $('#aud-phase-title').textContent = 'بانتظار بدء العرض النهائي..';
    }
    if (m.type === 'reveal') { books = m.data.books; renderBooks(); }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}

function renderBooks() {
  if (!books) return;
  $('#aud-phase-title').textContent = '🏆 صوّت لأكثر كتاب أضحكك';
  const box = $('#aud-books');
  box.innerHTML = '';
  books.forEach((b, i) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    const last = b.entries[b.entries.length - 1];
    li.innerHTML = `
      <div class="pname">📖 كتاب ${escapeHtml(b.ownerName)}</div>
      <button class="btn btn-sm ${myVote === i ? 'btn-primary' : 'btn-ghost'}" data-vote="${i}">صوّت 👍</button>
    `;
    li.querySelector('[data-vote]').onclick = () => {
      myVote = i;
      ws.send(JSON.stringify({ type: 'audienceVote', bookIndex: i }));
      renderBooks();
      toast('تم تسجيل صوتك! ✅');
    };
    box.appendChild(li);
  });
}

function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

window.addEventListener('DOMContentLoaded', () => {
  if (!code) { $('#aud-sub').textContent = 'رابط غير صالح — لا يوجد رمز غرفة'; $('#btn-aud-join').disabled = true; return; }
  $('#btn-aud-join').onclick = connect;
});
