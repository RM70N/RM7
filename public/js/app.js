/* ===== منطق العميل الرئيسي لـ"رسامين غنام" ===== */
const AVATARS = ['🎨', '🖌️', '🐫', '🦅', '🧑‍🎨', '👑', '🐱', '🌴', '☕', '🚀', '👽', '🦖', '🍔', '🎭', '⚡'];

const state = {
  ws: null,
  playerId: null,
  code: null,
  room: null,
  isHost: false,
  avatar: AVATARS[0],
  round: null,
  timerInt: null,
  draw: null,
  reveal: null,
  bookIdx: 0,
  entryShown: 0,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $('#screen-' + id).classList.add('active');
}

function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  setTimeout(() => t.classList.add('hidden'), 2600);
}

// ===== WebSocket =====
function connect() {
  return new Promise((resolve) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    state.ws = ws;
    ws.onopen = () => resolve(ws);
    ws.onmessage = (e) => handleServer(JSON.parse(e.data));
    ws.onclose = () => { if (state.code) toast('انقطع الاتصال، جارِ إعادة المحاولة..', 'err'); tryReconnect(); };
  });
}
function ws_send(msg) { if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(msg)); }

let reconnectT = null;
function tryReconnect() {
  if (!state.code || !state.playerId) return;
  clearTimeout(reconnectT);
  reconnectT = setTimeout(async () => {
    await connect();
    ws_send({ type: 'rejoin', code: state.code, playerId: state.playerId });
  }, 1500);
}

function handleServer(m) {
  switch (m.type) {
    case 'created':
      state.code = m.code; state.playerId = m.playerId; state.room = m.room; state.isHost = true;
      persist();
      enterLobby(m.room);
      break;
    case 'joined':
      state.code = m.code; state.playerId = m.playerId; state.room = m.room;
      state.isHost = m.room.hostId === m.playerId;
      persist();
      if (m.room.state === 'lobby') enterLobby(m.room);
      else showScreen('waiting');
      break;
    case 'roomState':
      state.room = m.room;
      state.isHost = m.room.hostId === state.playerId;
      if ($('#screen-lobby').classList.contains('active')) renderLobby(m.room);
      break;
    case 'gameStart':
      clearReveal();
      break;
    case 'round':
      startRoundClient(m.prompt, m.resumed);
      break;
    case 'roundMeta':
      break;
    case 'progress':
      updateProgress(m.submittedCount, m.totalCount);
      break;
    case 'submitAck':
      if (m.ok) showScreen('waiting'); else toast(m.message || 'تعذّر الإرسال', 'err');
      break;
    case 'reveal':
      enterReveal(m.data);
      break;
    case 'reaction':
      floatEmoji(m.emoji);
      break;
    case 'spectate':
      toast(m.message || 'ستنضم في الجولة القادمة');
      showScreen('waiting');
      break;
    case 'backToLobby':
      state.room = m.room; clearReveal(); enterLobby(m.room);
      break;
    case 'kicked':
      toast(m.message || 'تم طردك', 'err');
      setTimeout(() => { clearPersist(); location.href = '/'; }, 1500);
      break;
    case 'error':
      toast(m.message || 'حدث خطأ', 'err');
      break;
  }
}

function persist() { try { sessionStorage.setItem('gh_sess', JSON.stringify({ code: state.code, playerId: state.playerId })); } catch {} }
function clearPersist() { try { sessionStorage.removeItem('gh_sess'); } catch {} }

// ===== الشاشة الرئيسية =====
function initHome() {
  const grid = $('#home-avatars');
  AVATARS.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'av' + (i === 0 ? ' sel' : '');
    el.textContent = a;
    el.onclick = () => { $$('#home-avatars .av').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); state.avatar = a; };
    grid.appendChild(el);
  });

  // ملء الاسم من التخزين إن وُجد
  const savedName = localStorage.getItem('gh_name');
  if (savedName) $('#home-name').value = savedName;

  $('#btn-create').onclick = () => { if (!checkName()) return; $('#create-modal').classList.remove('hidden'); };
  $('#btn-create-confirm').onclick = doCreate;
  $('#btn-join').onclick = doJoinFromHome;
  $$('[data-close-modal]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.add('hidden')));

  // رمز مسبق من الرابط ?room=
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) $('#home-code').value = room.toUpperCase();

  // انضمام تلقائي قادم من صفحة الباركود (join.html)
  if (room && params.get('auto') === '1') {
    const savedName = localStorage.getItem('gh_name');
    const savedAvatar = localStorage.getItem('gh_avatar');
    if (savedName) {
      state.avatar = savedAvatar || state.avatar;
      autoJoin(room.toUpperCase(), savedName, state.avatar);
    }
  }
}

async function autoJoin(code, name, avatar) {
  await connect();
  ws_send({ type: 'join', code, player: { name, avatar } });
}

function checkName() {
  const name = $('#home-name').value.trim();
  if (name.length < 1) { toast('اكتب اسمك أولًا', 'err'); $('#home-name').focus(); return false; }
  localStorage.setItem('gh_name', name);
  return true;
}

async function doCreate() {
  const settings = {
    mode: $('#set-mode').value === 'speed' ? 'normal' : $('#set-mode').value,
    speedMode: $('#set-mode').value === 'speed',
    roundDuration: parseInt($('#set-duration').value) || 60,
    maxPlayers: parseInt($('#set-max').value) || 12,
    isPublic: $('#set-public').checked,
    family: $('#set-family').checked,
    allowLateJoin: $('#set-latejoin').checked,
  };
  await connect();
  ws_send({ type: 'create', settings, player: { name: $('#home-name').value.trim(), avatar: state.avatar } });
  $('#create-modal').classList.add('hidden');
}

async function doJoinFromHome() {
  if (!checkName()) return;
  const code = $('#home-code').value.trim().toUpperCase();
  if (code.length < 4) { toast('أدخل رمز الغرفة', 'err'); return; }
  await connect();
  ws_send({ type: 'join', code, player: { name: $('#home-name').value.trim(), avatar: state.avatar } });
}

// ===== Lobby =====
function enterLobby(room) { renderLobby(room); showScreen('lobby'); }

function renderLobby(room) {
  $('#lobby-code').textContent = room.code;
  $('#lobby-count').textContent = room.players.length;
  const list = $('#lobby-players');
  list.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.style.borderInlineStartColor = p.color;
    li.innerHTML = `
      <div class="pav" style="background:${p.color}22">${p.avatar}</div>
      <div class="pname">${escapeHtml(p.name)}</div>
      ${p.isHost ? '<span class="tag host">المضيف</span>' : ''}
      ${!p.connected ? '<span class="tag off">غير متصل</span>' : p.ready ? '<span class="tag ready">جاهز</span>' : ''}
    `;
    if (state.isHost && !p.isHost) {
      const k = document.createElement('span');
      k.className = 'kick'; k.textContent = '✕'; k.title = 'طرد';
      k.onclick = () => ws_send({ type: 'kick', playerId: p.id });
      li.appendChild(k);
    }
    list.appendChild(li);
  });

  const enough = room.players.filter((p) => p.connected).length >= room.settings.minPlayers;
  const startBtn = $('#btn-start');
  const readyBtn = $('#btn-ready');
  const settingsCard = $('#host-settings');
  if (state.isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !enough;
    readyBtn.classList.add('hidden');
    settingsCard.classList.remove('hidden');
    renderMiniSettings(room);
    $('#lobby-hint').textContent = enough ? 'كل شيء جاهز — اضغط ابدأ!' : `تحتاج ${room.settings.minPlayers} لاعبين على الأقل`;
  } else {
    startBtn.classList.add('hidden');
    readyBtn.classList.remove('hidden');
    settingsCard.classList.add('hidden');
    $('#lobby-hint').textContent = 'في انتظار أن يبدأ المضيف اللعبة..';
  }
}

function renderMiniSettings(room) {
  const s = room.settings;
  const modeName = s.speedMode ? 'السريع' : s.mode === 'secret' ? 'السري' : 'العادي';
  $('#mini-settings').innerHTML = `
    <div class="row"><span>النمط</span><b>${modeName}</b></div>
    <div class="row"><span>مدة الجولة</span><b>${s.roundDuration}ث</b></div>
    <div class="row"><span>أقصى لاعبين</span><b>${s.maxPlayers}</b></div>
    <div class="row"><span>الوضع العائلي</span><b>${s.family ? 'مفعّل' : 'معطّل'}</b></div>
  `;
}

function initLobby() {
  $('#btn-start').onclick = () => ws_send({ type: 'start' });
  $('#btn-ready').onclick = () => {
    const p = state.room.players.find((x) => x.id === state.playerId);
    ws_send({ type: 'ready', ready: !(p && p.ready) });
  };
  $('#btn-share').onclick = openShare;
  $('#lobby-code').onclick = () => { copy(state.code); toast('تم نسخ الرمز', 'ok'); };
  $$('#share-modal [data-close-modal]').forEach((b) => (b.onclick = () => $('#share-modal').classList.add('hidden')));
  $('#btn-copy-link').onclick = () => { copy($('#share-link').value); toast('تم نسخ الرابط', 'ok'); };
}

async function openShare() {
  const url = `${location.origin}/join.html?room=${state.code}`;
  $('#share-code').textContent = state.code;
  $('#share-link').value = url;
  $('#share-modal').classList.remove('hidden');
  try {
    const r = await fetch('/api/qr?url=' + encodeURIComponent(url));
    const { dataUrl } = await r.json();
    $('#qr-img').src = dataUrl;
  } catch {}
}

// ===== الكتابة / الرسم =====
function startRoundClient(prompt, resumed) {
  state.round = prompt;
  if (resumed) { showScreen('waiting'); return; }
  if (prompt.type === 'text') setupWrite(prompt);
  else setupDraw(prompt);
  startTimer(prompt.deadline);
}

function roundLabel(prompt) {
  const n = prompt.round + 1;
  return `الجولة ${n} من ${prompt.totalRounds} — ${prompt.type === 'text' ? '✍️ اكتب' : '🎨 ارسم'}`;
}

function setupWrite(prompt) {
  $('#write-round').textContent = roundLabel(prompt);
  const box = $('#write-prompt');
  if (prompt.round === 0) {
    box.innerHTML = '<span class="label">اكتب عبارة أو جملة يرسمها اللاعب التالي</span>💡 أطلق العنان لخيالك!';
  } else {
    box.innerHTML = '<span class="label">صف ما تراه في هذه الرسمة</span>' + drawingThumb(prompt.previous);
  }
  $('#write-text').value = '';
  $('#write-count').textContent = '0';
  showScreen('write');
  $('#write-text').focus();
}

function drawingThumb(entry) {
  // نُنشئ canvas مصغّرًا للرسمة السابقة
  const id = 'thumb' + Date.now();
  setTimeout(() => {
    const cv = document.getElementById(id);
    if (cv) window.renderStrokes(cv.getContext('2d'), entry.strokes || []);
  }, 10);
  return `<canvas id="${id}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}" style="width:100%;max-width:360px;background:#fff;border-radius:10px"></canvas>`;
}

function setupDraw(prompt) {
  $('#draw-round').textContent = roundLabel(prompt);
  $('#draw-prompt').innerHTML = '<span class="label">ارسم هذه العبارة</span>' + escapeHtml(prompt.previous?.text || '');
  if (!state.draw) { state.draw = new DrawEngine($('#canvas')); buildTools(); }
  state.draw.clear();
  showScreen('draw');
}

function initPhaseButtons() {
  const wt = $('#write-text');
  wt.oninput = () => ($('#write-count').textContent = wt.value.length);
  wt.onkeydown = (e) => { if (e.key === 'Enter') submitText(); };
  $('#btn-submit-text').onclick = submitText;
  $('#btn-suggest').onclick = async () => {
    const r = await fetch('/api/phrase'); const { phrase } = await r.json();
    wt.value = phrase; $('#write-count').textContent = phrase.length;
  };
  $('#btn-submit-draw').onclick = submitDraw;
}

function submitText() {
  const text = $('#write-text').value.trim();
  if (!text) { toast('اكتب شيئًا أولًا', 'err'); return; }
  ws_send({ type: 'submit', content: { text } });
  stopTimer();
}
function submitDraw() {
  const strokes = state.draw.getStrokes();
  ws_send({ type: 'submit', content: { strokes } });
  stopTimer();
}

// أدوات الرسم
function buildTools() {
  const c = $('#tools');
  c.innerHTML = '';
  const d = state.draw;
  const tools = [
    { t: 'pencil', i: '✏️' }, { t: 'eraser', i: '🩹' }, { t: 'fill', i: '🪣' },
    { t: 'line', i: '📏' }, { t: 'rect', i: '▭' }, { t: 'circle', i: '⭕' }, { t: 'eyedropper', i: '💧' },
  ];
  tools.forEach((tool) => {
    const b = document.createElement('button');
    b.className = 'tool-btn' + (tool.t === 'pencil' ? ' active' : '');
    b.textContent = tool.i; b.title = tool.t;
    b.onclick = () => { d.setTool(tool.t); $$('#tools .tool-btn').forEach((x) => x.classList.remove('active')); b.classList.add('active'); };
    c.appendChild(b);
  });
  sep(c);
  // أحجام الفرشاة
  const sizes = [3, 6, 12, 20, 32];
  const sizeWrap = document.createElement('div'); sizeWrap.className = 'size-pick';
  sizes.forEach((sz, i) => {
    const dot = document.createElement('span');
    dot.className = 'size-dot' + (i === 1 ? ' active' : '');
    const px = Math.max(6, sz / 1.5); dot.style.width = px + 'px'; dot.style.height = px + 'px';
    dot.onclick = () => { d.setSize(sz); $$('.size-dot').forEach((x) => x.classList.remove('active')); dot.classList.add('active'); };
    sizeWrap.appendChild(dot);
  });
  c.appendChild(sizeWrap);
  sep(c);
  // undo/redo/clear
  addBtn(c, '↶', () => d.undo());
  addBtn(c, '↷', () => d.redo());
  addBtn(c, '🗑️', () => d.clear());
  // الألوان
  const palRow = document.createElement('div'); palRow.style.width = '100%'; palRow.style.display = 'flex'; palRow.style.flexWrap = 'wrap'; palRow.style.gap = '6px'; palRow.style.justifyContent = 'center'; palRow.style.marginTop = '8px';
  window.DRAW_PALETTE.forEach((col, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
    sw.style.background = col;
    sw.onclick = () => { d.setColor(col); $$('.color-swatch').forEach((x) => x.classList.remove('active')); sw.classList.add('active'); };
    palRow.appendChild(sw);
  });
  const custom = document.createElement('input');
  custom.type = 'color'; custom.className = 'color-swatch'; custom.style.padding = '0'; custom.title = 'لون مخصص';
  custom.oninput = () => d.setColor(custom.value);
  palRow.appendChild(custom);
  c.appendChild(palRow);
  d.onColorPicked = (hex) => { custom.value = hex; };
}
function sep(c) { const s = document.createElement('div'); s.className = 'tool-sep'; c.appendChild(s); }
function addBtn(c, label, fn) { const b = document.createElement('button'); b.className = 'tool-btn'; b.textContent = label; b.onclick = fn; c.appendChild(b); }

// ===== المؤقّت =====
function startTimer(deadline) {
  stopTimer();
  const update = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $$('.timer').forEach((t) => {
      t.textContent = left;
      t.classList.toggle('danger', left <= 10);
    });
    if (left <= 0) stopTimer();
  };
  update();
  state.timerInt = setInterval(update, 250);
}
function stopTimer() { if (state.timerInt) { clearInterval(state.timerInt); state.timerInt = null; } }

function updateProgress(sub, total) {
  const pct = total ? (sub / total) * 100 : 0;
  $('#wait-progress').style.width = pct + '%';
  $('#wait-count').textContent = `${sub} / ${total} أرسلوا`;
}

// ===== العرض النهائي (الكتاب) =====
function enterReveal(data) {
  state.reveal = data; state.bookIdx = 0; state.entryShown = 0;
  stopTimer();
  renderBook();
  showScreen('reveal');
}
function clearReveal() { state.reveal = null; }

function renderBook() {
  const data = state.reveal; if (!data) return;
  const book = data.books[state.bookIdx];
  $('#reveal-title').textContent = `📖 كتاب ${escapeHtml(book.ownerName)}`;
  $('#book-indicator').textContent = `${state.bookIdx + 1} / ${data.books.length}`;
  const stage = $('#reveal-stage');
  stage.innerHTML = '';
  book.entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'book-entry' + (i <= state.entryShown ? ' shown' : '');
    const content = entry.type === 'text'
      ? `<div class="content text">${escapeHtml(entry.text)}</div>`
      : `<div class="content"><canvas id="bk${state.bookIdx}_${i}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}"></canvas></div>`;
    row.innerHTML = `
      <div class="who"><div class="pav" style="background:${entry.authorColor}22">${entry.authorAvatar}</div><div class="wname">${escapeHtml(entry.authorName)}</div></div>
      ${content}`;
    stage.appendChild(row);
    if (entry.type === 'drawing' && i <= state.entryShown) {
      setTimeout(() => { const cv = document.getElementById(`bk${state.bookIdx}_${i}`); if (cv) window.renderStrokes(cv.getContext('2d'), entry.strokes || []); }, 20);
    }
  });
  const done = state.entryShown >= book.entries.length - 1;
  $('#btn-reveal-step').textContent = done ? (state.bookIdx < data.books.length - 1 ? 'الكتاب التالي ▶' : 'انتهى العرض 🏁') : 'اكشف التالي ✨';
  $('#btn-play-again').classList.toggle('hidden', !(done && state.bookIdx >= data.books.length - 1) || !state.isHost);
}

function initReveal() {
  $('#btn-reveal-step').onclick = () => {
    const book = state.reveal.books[state.bookIdx];
    if (state.entryShown < book.entries.length - 1) {
      state.entryShown++;
      revealRow();
    } else if (state.bookIdx < state.reveal.books.length - 1) {
      state.bookIdx++; state.entryShown = 0; renderBook();
    }
  };
  $('#btn-book-next').onclick = () => { if (state.bookIdx < state.reveal.books.length - 1) { state.bookIdx++; state.entryShown = 99; renderBook(); } };
  $('#btn-book-prev').onclick = () => { if (state.bookIdx > 0) { state.bookIdx--; state.entryShown = 99; renderBook(); } };
  $('#btn-play-again').onclick = () => ws_send({ type: 'playAgain' });
  $$('#reveal-reactions .react').forEach((b) => (b.onclick = () => {
    ws_send({ type: 'reaction', bookIndex: state.bookIdx, entryIndex: state.entryShown, emoji: b.dataset.emoji });
    floatEmoji(b.dataset.emoji);
  }));
}

function revealRow() {
  const book = state.reveal.books[state.bookIdx];
  const rows = $$('#reveal-stage .book-entry');
  const row = rows[state.entryShown];
  if (row) {
    row.classList.add('shown');
    const entry = book.entries[state.entryShown];
    if (entry.type === 'drawing') {
      const cv = document.getElementById(`bk${state.bookIdx}_${state.entryShown}`);
      if (cv) window.renderStrokes(cv.getContext('2d'), entry.strokes || []);
    }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const done = state.entryShown >= book.entries.length - 1;
  $('#btn-reveal-step').textContent = done ? (state.bookIdx < state.reveal.books.length - 1 ? 'الكتاب التالي ▶' : 'انتهى العرض 🏁') : 'اكشف التالي ✨';
  $('#btn-play-again').classList.toggle('hidden', !(done && state.bookIdx >= state.reveal.books.length - 1) || !state.isHost);
}

function floatEmoji(emoji) {
  const el = document.createElement('div');
  el.className = 'float-emoji'; el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + '%';
  el.style.bottom = '80px';
  $('#react-layer').appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ===== أدوات =====
function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function copy(text) { navigator.clipboard?.writeText(text).catch(() => {}); }

// ===== تشغيل =====
window.addEventListener('DOMContentLoaded', () => {
  initHome(); initLobby(); initPhaseButtons(); initReveal();
  showScreen('home');
});
