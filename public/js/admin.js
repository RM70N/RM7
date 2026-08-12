/* ===== لوحة تحكم الإدارة ===== */
const $ = (s) => document.querySelector(s);
let TOKEN = sessionStorage.getItem('gh_admin_token') || '';

function toast(msg, kind = '') { const t = $('#toast'); t.textContent = msg; t.className = 'toast ' + kind; setTimeout(() => t.classList.add('hidden'), 2400); }
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-token': TOKEN, ...(opts.headers || {}) } });
  if (r.status === 401) { toast('رمز إدارة غير صحيح', 'err'); throw new Error('unauthorized'); }
  return r.json();
}

async function login() {
  TOKEN = $('#admin-token').value.trim();
  try {
    await api('/api/admin/stats');
    sessionStorage.setItem('gh_admin_token', TOKEN);
    $('#login-box').classList.add('hidden');
    $('#admin-body').classList.remove('hidden');
    await refreshAll();
  } catch { /* handled by api() */ }
}

async function refreshAll() {
  await Promise.all([loadStats(), loadPhrases(), loadWords()]);
}

async function loadStats() {
  const data = await api('/api/admin/stats');
  $('#stat-rooms').textContent = data.activeRooms;
  $('#stat-players').textContent = data.totalPlayers;
  $('#stat-created').textContent = data.stats?.roomsCreated || 0;
  const list = $('#rooms-list');
  list.innerHTML = data.rooms.length
    ? data.rooms.map((r) => `<li><span>${r.code} — ${escapeHtml(r.mode)} — ${r.state} — ${r.players} لاعب</span><button data-close="${r.code}">إغلاق ✕</button></li>`).join('')
    : '<li>لا غرف نشطة حاليًا</li>';
  list.querySelectorAll('[data-close]').forEach((b) => (b.onclick = async () => {
    await api('/api/admin/room/' + b.dataset.close, { method: 'DELETE' });
    toast('تم إغلاق الغرفة', 'ok');
    loadStats();
  }));
}

async function loadPhrases() {
  const { overrides } = await api('/api/admin/phrases');
  const list = $('#phrases-list');
  list.innerHTML = overrides.added.length
    ? overrides.added.map((p) => `<li><span>[${escapeHtml(p.category)}] ${escapeHtml(p.phrase)}</span><button data-del="${escapeHtml(p.phrase)}">حذف</button></li>`).join('')
    : '<li>لا عبارات مضافة يدويًا بعد</li>';
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api('/api/admin/phrases', { method: 'DELETE', body: JSON.stringify({ phrase: b.dataset.del }) });
    loadPhrases();
  }));
}

async function loadWords() {
  const { overrides } = await api('/api/admin/profanity');
  const list = $('#words-list');
  list.innerHTML = overrides.added.length
    ? overrides.added.map((w) => `<li><span>${escapeHtml(w)}</span><button data-del="${escapeHtml(w)}">حذف</button></li>`).join('')
    : '<li>لا كلمات مضافة يدويًا بعد</li>';
  list.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    await api('/api/admin/profanity', { method: 'DELETE', body: JSON.stringify({ word: b.dataset.del }) });
    loadWords();
  }));
}

window.addEventListener('DOMContentLoaded', () => {
  $('#btn-login').onclick = login;
  $('#admin-token').onkeydown = (e) => { if (e.key === 'Enter') login(); };
  $('#btn-ann').onclick = async () => {
    await api('/api/admin/announcement', { method: 'POST', body: JSON.stringify({ text: $('#ann-text').value.trim() }) });
    toast('تم نشر الإعلان', 'ok'); $('#ann-text').value = '';
  };
  $('#btn-add-phrase').onclick = async () => {
    const category = $('#phrase-cat').value, phrase = $('#phrase-text').value.trim();
    if (!phrase) return;
    await api('/api/admin/phrases', { method: 'POST', body: JSON.stringify({ category, phrase }) });
    $('#phrase-text').value = ''; loadPhrases();
  };
  $('#btn-add-word').onclick = async () => {
    const word = $('#word-text').value.trim();
    if (!word) return;
    await api('/api/admin/profanity', { method: 'POST', body: JSON.stringify({ word }) });
    $('#word-text').value = ''; loadWords();
  };
  if (TOKEN) login();
});
