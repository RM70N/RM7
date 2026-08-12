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
  modes: [],
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
    const ws = new WebSocket(window.ghannamWsUrl());
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
      persist(); linkSavedAccount(); enterLobby(m.room);
      break;
    case 'joined':
      state.code = m.code; state.playerId = m.playerId; state.room = m.room;
      state.isHost = m.room.hostId === m.playerId;
      persist(); linkSavedAccount();
      if (m.room.state === 'lobby') enterLobby(m.room);
      else showScreen('waiting');
      break;
    case 'roomState':
      state.room = m.room;
      state.isHost = m.room.hostId === state.playerId;
      if ($('#screen-lobby').classList.contains('active')) renderLobby(m.room);
      if (!$('#streamer-modal').classList.contains('hidden')) renderStreamerPlayers(m.room);
      break;
    case 'announcement':
      renderAnnouncement(m.text);
      break;
    case 'gameStart':
      clearReveal();
      break;
    case 'round':
      startRoundClient(m.prompt, m.resumed, m.isActing);
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
    case 'accountLinked':
      localStorage.setItem('gh_account_token', m.account.token);
      renderAccountModal(m.account);
      break;
    case 'audienceTally':
      renderAudienceTally(m);
      break;
    case 'publishedGallery':
      toast('تم النشر في المعرض العام! 🎉', 'ok');
      break;
    case 'finalResults':
      renderResults(m.awards);
      break;
    case 'error':
      toast(m.message || 'حدث خطأ', 'err');
      break;
  }
}

function persist() { try { sessionStorage.setItem('gh_sess', JSON.stringify({ code: state.code, playerId: state.playerId })); } catch {} }
function clearPersist() { try { sessionStorage.removeItem('gh_sess'); } catch {} }
function linkSavedAccount() {
  const token = localStorage.getItem('gh_account_token');
  if (token) ws_send({ type: 'linkAccount', token });
}

// ===== الشاشة الرئيسية =====
async function initHome() {
  const grid = $('#home-avatars');
  AVATARS.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'av' + (i === 0 ? ' sel' : '');
    el.textContent = a;
    el.onclick = () => { $$('#home-avatars .av').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); state.avatar = a; };
    grid.appendChild(el);
  });

  const savedName = localStorage.getItem('gh_name');
  if (savedName) $('#home-name').value = savedName;

  await loadModes();
  await loadCategories();

  $('#btn-create').onclick = () => { if (!checkName()) return; $('#create-modal').classList.remove('hidden'); };
  $('#btn-create-confirm').onclick = doCreate;
  $('#btn-join').onclick = doJoinFromHome;
  $('#btn-daily').onclick = openDaily;
  $('#btn-account').onclick = openAccountModal;
  $('#btn-save-account').onclick = saveAccount;
  $$('[data-close-modal]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.add('hidden')));

  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) $('#home-code').value = room.toUpperCase();
  if (room && params.get('auto') === '1') {
    const nm = localStorage.getItem('gh_name');
    const av = localStorage.getItem('gh_avatar');
    if (nm) { state.avatar = av || state.avatar; autoJoin(room.toUpperCase(), nm, state.avatar); }
  }

  fetchAnnouncementOnce();
}

async function autoJoin(code, name, avatar) {
  await connect(); linkSavedAccount();
  ws_send({ type: 'join', code, player: { name, avatar } });
}

async function loadModes() {
  try {
    const r = await fetch(window.ghannamApi('/api/modes')); const { modes } = await r.json();
    state.modes = modes;
    const sel = $('#set-mode');
    sel.innerHTML = modes.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    sel.onchange = () => { $('#mode-desc').textContent = modes.find((m) => m.id === sel.value)?.description || ''; };
    sel.onchange();
  } catch {}
}
async function loadCategories() {
  try {
    const r = await fetch(window.ghannamApi('/api/categories')); const { categories } = await r.json();
    const sel = $('#set-category');
    categories.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  } catch {}
}

function checkName() {
  const name = $('#home-name').value.trim();
  if (name.length < 1) { toast('اكتب اسمك أولًا', 'err'); $('#home-name').focus(); return false; }
  localStorage.setItem('gh_name', name);
  return true;
}

async function doCreate() {
  const scheduleVal = $('#set-schedule').value;
  const settings = {
    mode: $('#set-mode').value,
    roundDuration: parseInt($('#set-duration').value) || 60,
    maxPlayers: parseInt($('#set-max').value) || 12,
    isPublic: $('#set-public').checked,
    family: $('#set-family').checked,
    allowLateJoin: $('#set-latejoin').checked,
    visibility: $('#set-visibility').value,
    teams: $('#set-teams').checked,
    dailyChallenge: $('#set-daily').checked,
    audienceVoting: $('#set-audience').checked,
    category: $('#set-category').value || null,
    scheduledAt: scheduleVal ? new Date(scheduleVal).getTime() : null,
    autoStart: !!scheduleVal,
  };
  await connect();
  linkSavedAccount();
  ws_send({ type: 'create', settings, player: { name: $('#home-name').value.trim(), avatar: state.avatar } });
  $('#create-modal').classList.add('hidden');
}

async function doJoinFromHome() {
  if (!checkName()) return;
  const code = $('#home-code').value.trim().toUpperCase();
  if (code.length < 4) { toast('أدخل رمز الغرفة', 'err'); return; }
  await connect();
  linkSavedAccount();
  ws_send({ type: 'join', code, player: { name: $('#home-name').value.trim(), avatar: state.avatar } });
}

// ===== التحدي اليومي =====
async function openDaily() {
  $('#daily-modal').classList.remove('hidden');
  try {
    const r1 = await fetch(window.ghannamApi('/api/daily/phrase')); const { phrase } = await r1.json();
    $('#daily-phrase-box').textContent = phrase;
    const r2 = await fetch(window.ghannamApi('/api/daily/leaderboard')); const { leaderboard } = await r2.json();
    const list = $('#daily-leaderboard');
    list.innerHTML = leaderboard.length
      ? leaderboard.slice(0, 10).map((e) => `<li>${escapeHtml(e.avatar || '🎨')} <b>${escapeHtml(e.name)}</b> — ${e.reactions} تفاعل</li>`).join('')
      : '<li class="lobby-hint">لا نتائج بعد اليوم — كن أول من يلعب!</li>';
  } catch { toast('تعذّر تحميل التحدي اليومي', 'err'); }
}

// ===== الحساب الاختياري =====
async function openAccountModal() {
  $('#account-modal').classList.remove('hidden');
  const token = localStorage.getItem('gh_account_token');
  if (!token) { $('#account-guest').classList.remove('hidden'); $('#account-info').classList.add('hidden'); return; }
  try {
    const r = await fetch(window.ghannamApi('/api/account/') + token);
    if (!r.ok) throw new Error();
    const { account } = await r.json();
    renderAccountModal(account);
  } catch { $('#account-guest').classList.remove('hidden'); $('#account-info').classList.add('hidden'); }
}
function renderAccountModal(acc) {
  $('#account-guest').classList.add('hidden');
  $('#account-info').classList.remove('hidden');
  $('#acc-name').textContent = acc.name;
  $('#acc-score').textContent = acc.score;
  $('#acc-games').textContent = acc.gamesPlayed;
  $('#acc-badges').innerHTML = acc.badges.length
    ? acc.badges.map((b) => `<span class="badge-chip">${escapeHtml(b)}</span>`).join('')
    : '<span class="lobby-hint">لا شارات بعد</span>';
}
async function saveAccount() {
  const name = localStorage.getItem('gh_name') || $('#home-name').value.trim() || 'لاعب';
  try {
    const r = await fetch(window.ghannamApi('/api/account'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const { account } = await r.json();
    localStorage.setItem('gh_account_token', account.token);
    renderAccountModal(account);
    if (state.ws?.readyState === WebSocket.OPEN) ws_send({ type: 'linkAccount', token: account.token, name });
    toast('تم حفظ حسابك ✅', 'ok');
  } catch { toast('تعذّر حفظ الحساب', 'err'); }
}

// ===== إعلان لوحة التحكم =====
async function fetchAnnouncementOnce() {
  try { const r = await fetch(window.ghannamApi('/api/announcement')); const { text } = await r.json(); if (text) renderAnnouncement(text); } catch {}
}
function renderAnnouncement(text) {
  const b = $('#announcement-banner');
  if (!text) { b.classList.add('hidden'); return; }
  b.textContent = '📢 ' + text;
  b.classList.remove('hidden');
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
      <div class="pname">${escapeHtml(p.name)} ${p.team ? `<span class="team-tag team-${p.team}">${p.team === 'A' ? 'فريق أ' : 'فريق ب'}</span>` : ''}</div>
      ${p.isHost ? '<span class="tag host">المضيف</span>' : ''}
      ${p.favorite ? '<span class="tag fav">⭐ مفضّل</span>' : ''}
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
  $('#btn-streamer').classList.toggle('hidden', !state.isHost);

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

  const schedBanner = $('#schedule-banner');
  if (room.settings.scheduledAt) {
    const d = new Date(room.settings.scheduledAt);
    schedBanner.textContent = `⏰ ستبدأ اللعبة تلقائيًا الساعة ${d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}`;
    schedBanner.classList.remove('hidden');
  } else schedBanner.classList.add('hidden');
}

function renderMiniSettings(room) {
  const s = room.settings;
  const modeName = state.modes.find((m) => m.id === s.mode)?.name || s.mode;
  $('#mini-settings').innerHTML = `
    <div class="row"><span>النمط</span><b>${escapeHtml(modeName)}</b></div>
    <div class="row"><span>مدة الجولة</span><b>${s.roundDuration}ث</b></div>
    <div class="row"><span>أقصى لاعبين</span><b>${s.maxPlayers}</b></div>
    <div class="row"><span>الوضع العائلي</span><b>${s.family ? 'مفعّل' : 'معطّل'}</b></div>
    <div class="row"><span>وضع الفرق</span><b>${s.teams ? 'مفعّل' : 'معطّل'}</b></div>
    <div class="row"><span>تحدي اليوم</span><b>${s.dailyChallenge ? 'مفعّل' : 'معطّل'}</b></div>
  `;
}

function initLobby() {
  $('#btn-start').onclick = () => ws_send({ type: 'start' });
  $('#btn-ready').onclick = () => {
    const p = state.room.players.find((x) => x.id === state.playerId);
    ws_send({ type: 'ready', ready: !(p && p.ready) });
  };
  $('#btn-share').onclick = openShare;
  $('#btn-streamer').onclick = openStreamerPanel;
  $('#lobby-code').onclick = () => { copy(state.code); toast('تم نسخ الرمز', 'ok'); };
  $$('.modal [data-close-modal]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.add('hidden')));
  $('#btn-copy-link').onclick = () => { copy($('#share-link').value); toast('تم نسخ الرابط', 'ok'); };
  $$('.copy-btn').forEach((b) => (b.onclick = () => { copy($('#' + b.dataset.copy).value); toast('تم النسخ', 'ok'); }));
  $('#set-safemode').onchange = (e) => {
    ws_send({ type: 'streamerSafeMode', enabled: e.target.checked });
    $('#btn-approve-reveal').classList.toggle('hidden', !e.target.checked);
  };
  $('#btn-approve-reveal').onclick = () => ws_send({ type: 'streamerApprove' });
}

async function openShare() {
  const url = `${location.origin}/join.html?room=${state.code}`;
  $('#share-code').textContent = state.code;
  $('#share-link').value = url;
  $('#share-modal').classList.remove('hidden');
  try { const r = await fetch(window.ghannamApi('/api/qr?url=') + encodeURIComponent(url)); const { dataUrl } = await r.json(); $('#qr-img').src = dataUrl; } catch {}
}

async function openStreamerPanel() {
  const overlayUrl = `${location.origin}/overlay.html?room=${state.code}`;
  const audienceUrl = `${location.origin}/audience.html?room=${state.code}`;
  $('#overlay-link').value = overlayUrl;
  $('#audience-link').value = audienceUrl;
  $('#streamer-modal').classList.remove('hidden');
  try { const r = await fetch(window.ghannamApi('/api/qr?url=') + encodeURIComponent(audienceUrl)); const { dataUrl } = await r.json(); $('#audience-qr').src = dataUrl; } catch {}
  renderStreamerPlayers(state.room);
}

function renderStreamerPlayers(room) {
  if (!room) return;
  const list = $('#streamer-players');
  list.innerHTML = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <div class="pav" style="background:${p.color}22">${p.avatar}</div>
      <div class="pname">${escapeHtml(p.name)}</div>
      <button class="btn btn-sm ${p.favorite ? 'btn-primary' : 'btn-ghost'}" data-act="fav">⭐</button>
      <button class="btn btn-sm ${p.banned ? 'btn-primary' : 'btn-ghost'}" data-act="ban">🚫</button>
      <button class="btn btn-sm ${p.hidden ? 'active' : ''} btn-ghost" data-act="hide">🙈</button>
    `;
    li.querySelector('[data-act=fav]').onclick = () => ws_send({ type: 'streamerFavorite', playerId: p.id, favorite: !p.favorite });
    li.querySelector('[data-act=ban]').onclick = () => ws_send({ type: 'streamerBan', playerId: p.id, banned: !p.banned });
    li.querySelector('[data-act=hide]').onclick = () => ws_send({ type: 'streamerHide', playerId: p.id, hidden: !p.hidden });
    list.appendChild(li);
  });
}

function renderAudienceTally(m) {
  const box = $('#audience-tally-box');
  box.classList.remove('hidden');
  const entries = Object.entries(m.tally || {});
  box.innerHTML = `<b>👥 الجمهور: ${m.total}</b>` + (entries.length
    ? '<br>' + entries.map(([k, v]) => `كتاب ${Number(k) + 1}: ${v} صوت`).join(' — ')
    : '');
}

// ===== الكتابة / الرسم =====
function startRoundClient(prompt, resumed, isActing) {
  state.round = prompt;
  if (prompt.spectating || isActing === false) { showScreen('spectate'); return; }
  if (resumed) { showScreen('waiting'); return; }
  if (prompt.type === 'text') setupWrite(prompt);
  else setupDraw(prompt);
  startTimer(prompt.deadline, prompt.noTimer);
}

function roundLabel(prompt) {
  const n = prompt.round + 1;
  const modeLabel = prompt.mode === 'story' ? '📖 القصة' : prompt.type === 'text' ? '✍️ اكتب' : '🎨 ارسم';
  return `الجولة ${n} من ${prompt.totalRounds} — ${modeLabel}`;
}

function renderChain(container, chain) {
  if (!chain || chain.length < 2) { container.classList.add('hidden'); return; }
  container.classList.remove('hidden');
  container.innerHTML = '<div class="chain-label">🔗 السلسلة حتى الآن</div>' + chain.map((e, i) => {
    if (e.type === 'text') return `<div class="chain-item">${i + 1}. ${escapeHtml(e.text || '')}</div>`;
    const id = 'chain' + Date.now() + i;
    setTimeout(() => { const cv = document.getElementById(id); if (cv) window.renderStrokes(cv.getContext('2d'), e.strokes || []); }, 10);
    return `<div class="chain-item"><canvas id="${id}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}" class="chain-thumb"></canvas></div>`;
  }).join('');
}

function setupWrite(prompt) {
  $('#write-round').textContent = roundLabel(prompt);
  const box = $('#write-prompt');
  const dailyTag = prompt.previous?.daily ? '<span class="label">🏆 تحدي اليوم</span>' : '';
  if (prompt.round === 0 && !prompt.previous) {
    box.innerHTML = '<span class="label">اكتب عبارة أو جملة يرسمها اللاعب التالي</span>💡 أطلق العنان لخيالك!';
  } else if (prompt.previous?.type === 'text') {
    box.innerHTML = `${dailyTag}<span class="label">تابع القصة</span>${escapeHtml(prompt.previous.text || '')}`;
  } else {
    box.innerHTML = '<span class="label">صف ما تراه في هذه الرسمة</span>' + drawingThumb(prompt.previous);
  }
  renderChain($('#write-chain'), prompt.chain);
  $('#write-banned').classList.toggle('hidden', !prompt.banned);
  $('#write-text').disabled = !!prompt.banned;
  $('#btn-submit-text').disabled = !!prompt.banned;
  $('#write-text').value = '';
  $('#write-count').textContent = '0';
  showScreen('write');
  if (!prompt.banned) $('#write-text').focus();
}

function drawingThumb(entry) {
  const id = 'thumb' + Date.now();
  setTimeout(() => { const cv = document.getElementById(id); if (cv) window.renderStrokes(cv.getContext('2d'), entry?.strokes || []); }, 10);
  return `<canvas id="${id}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}" style="width:100%;max-width:360px;background:#fff;border-radius:10px"></canvas>`;
}

function setupDraw(prompt) {
  $('#draw-round').textContent = roundLabel(prompt);
  let promptHtml;
  if (prompt.previous?.type === 'drawing') {
    promptHtml = '<span class="label">أكمل هذه الرسمة بإبداع</span>' + (prompt.previous.seeded ? '👇 ارسم فوق الشكل الناقص' : '👇 أضف لمستك على اللوحة الجماعية');
  } else {
    const dailyTag = prompt.previous?.daily ? '🏆 ' : '';
    promptHtml = '<span class="label">ارسم هذه العبارة</span>' + dailyTag + escapeHtml(prompt.previous?.text || '');
  }
  $('#draw-prompt').innerHTML = promptHtml;
  $('#draw-banned').classList.toggle('hidden', !prompt.banned);
  if (!state.draw) { state.draw = new DrawEngine($('#canvas')); buildTools(); }
  state.draw.clear();
  if (prompt.seedStrokes?.length) { state.draw.strokes = [...prompt.seedStrokes]; state.draw._redraw(); }
  $('#tools').classList.toggle('hidden', !!prompt.banned);
  $('#btn-submit-draw').disabled = !!prompt.banned;
  showScreen('draw');
}

function initPhaseButtons() {
  const wt = $('#write-text');
  wt.oninput = () => ($('#write-count').textContent = wt.value.length);
  wt.onkeydown = (e) => { if (e.key === 'Enter') submitText(); };
  $('#btn-submit-text').onclick = submitText;
  $('#btn-suggest').onclick = async () => {
    const r = await fetch(window.ghannamApi('/api/phrase') + (state.room?.settings?.category ? '?category=' + encodeURIComponent(state.room.settings.category) : ''));
    const { phrase } = await r.json();
    wt.value = phrase; $('#write-count').textContent = phrase.length;
  };
  $('#btn-submit-draw').onclick = submitDraw;
}

function submitText() {
  if (state.round?.banned) return;
  const text = $('#write-text').value.trim();
  if (!text) { toast('اكتب شيئًا أولًا', 'err'); return; }
  ws_send({ type: 'submit', content: { text } });
  stopTimer();
}
function submitDraw() {
  if (state.round?.banned) return;
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
  addBtn(c, '↶', () => d.undo());
  addBtn(c, '↷', () => d.redo());
  addBtn(c, '🗑️', () => d.clear());
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
function startTimer(deadline, noTimer) {
  stopTimer();
  if (noTimer) { $$('.timer').forEach((t) => { t.textContent = '∞'; t.classList.remove('danger'); }); return; }
  const update = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    $$('.timer').forEach((t) => { t.textContent = left; t.classList.toggle('danger', left <= 10); });
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
  syncRevealNav();
  showScreen('reveal');
}
function clearReveal() { state.reveal = null; }

function syncRevealNav() {
  if (state.isHost) ws_send({ type: 'revealNav', bookIndex: state.bookIdx, entryShown: state.entryShown });
}

function renderBook() {
  const data = state.reveal; if (!data) return;
  const book = data.books[state.bookIdx];
  const secretMode = data.hideAuthorsUntilComplete;
  const complete = state.entryShown >= book.entries.length - 1;
  $('#reveal-title').textContent = secretMode && !complete ? '📖 كتاب مجهول 🕵️' : `📖 كتاب ${escapeHtml(book.ownerName)}`;
  $('#book-indicator').textContent = `${state.bookIdx + 1} / ${data.books.length}`;

  const teamsBar = $('#team-scores-bar');
  if (data.teams) {
    teamsBar.classList.remove('hidden');
    teamsBar.innerHTML = `<span class="team-a">فريق أ: ${data.teams.A}</span> <span class="team-b">فريق ب: ${data.teams.B}</span>`;
  } else teamsBar.classList.add('hidden');

  const stage = $('#reveal-stage');
  stage.innerHTML = '';
  book.entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'book-entry' + (i <= state.entryShown ? ' shown' : '');
    const hideAuthor = secretMode && !(i <= state.entryShown && complete);
    const content = entry.type === 'text'
      ? `<div class="content text">${escapeHtml(entry.text)}</div>`
      : `<div class="content"><canvas id="bk${state.bookIdx}_${i}" width="${window.LOGICAL_W}" height="${window.LOGICAL_H}"></canvas></div>`;
    row.innerHTML = `
      <div class="who"><div class="pav" style="background:${entry.authorColor || '#888'}22">${hideAuthor ? '❓' : entry.authorAvatar}</div><div class="wname">${hideAuthor ? '؟؟؟' : escapeHtml(entry.authorName)}</div></div>
      ${content}`;
    stage.appendChild(row);
    if (entry.type === 'drawing' && i <= state.entryShown) {
      setTimeout(() => { const cv = document.getElementById(`bk${state.bookIdx}_${i}`); if (cv) window.renderStrokes(cv.getContext('2d'), entry.strokes || []); }, 20);
    }
  });
  const done = complete;
  const lastBook = state.bookIdx >= data.books.length - 1;
  $('#btn-reveal-step').textContent = done ? (lastBook ? 'انتهى العرض 🏁' : 'الكتاب التالي ▶') : 'اكشف التالي ✨';
  $('#btn-reveal-step').classList.toggle('hidden', done && lastBook);
  $('#btn-play-again').classList.toggle('hidden', !(done && lastBook) || !state.isHost);
  $('#btn-show-results').classList.toggle('hidden', !(done && lastBook) || !state.isHost);
  $('#btn-publish-gallery').classList.toggle('hidden', !state.isHost);
}

function initReveal() {
  $('#btn-reveal-step').onclick = () => {
    const book = state.reveal.books[state.bookIdx];
    if (state.entryShown < book.entries.length - 1) { state.entryShown++; revealRow(); }
    else if (state.bookIdx < state.reveal.books.length - 1) { state.bookIdx++; state.entryShown = 0; renderBook(); syncRevealNav(); }
    syncRevealNav();
  };
  $('#btn-book-next').onclick = () => { if (state.bookIdx < state.reveal.books.length - 1) { state.bookIdx++; state.entryShown = 99; renderBook(); syncRevealNav(); } };
  $('#btn-book-prev').onclick = () => { if (state.bookIdx > 0) { state.bookIdx--; state.entryShown = 99; renderBook(); syncRevealNav(); } };
  $('#btn-play-again').onclick = () => ws_send({ type: 'playAgain' });
  $('#btn-show-results').onclick = () => ws_send({ type: 'showResults' });
  $('#btn-publish-gallery').onclick = () => { ws_send({ type: 'publishGallery', bookIndex: state.bookIdx }); };
  $('#btn-results-back').onclick = () => ws_send({ type: 'playAgain' });
  $$('#reveal-reactions .react').forEach((b) => (b.onclick = () => {
    ws_send({ type: 'reaction', bookIndex: state.bookIdx, entryIndex: state.entryShown, emoji: b.dataset.emoji });
    floatEmoji(b.dataset.emoji);
  }));
}

function revealRow() {
  const book = state.reveal.books[state.bookIdx];
  const rows = $$('#reveal-stage .book-entry');
  const row = rows[state.entryShown];
  const complete = state.entryShown >= book.entries.length - 1;
  if (row) {
    row.classList.add('shown');
    const entry = book.entries[state.entryShown];
    const hideAuthor = state.reveal.hideAuthorsUntilComplete && !complete;
    if (entry.type === 'drawing') { const cv = document.getElementById(`bk${state.bookIdx}_${state.entryShown}`); if (cv) window.renderStrokes(cv.getContext('2d'), entry.strokes || []); }
    if (!hideAuthor) {
      const av = row.querySelector('.pav'), wn = row.querySelector('.wname');
      if (av) av.textContent = entry.authorAvatar; if (wn) wn.textContent = entry.authorName;
    }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (complete) renderBook(); // لإعادة كشف كل الأسماء في النمط السري وتحديث العنوان/الأزرار
  else {
    const lastBook = state.bookIdx >= state.reveal.books.length - 1;
    $('#btn-reveal-step').textContent = 'اكشف التالي ✨';
  }
}

function renderResults(awards) {
  const grid = $('#awards-grid');
  const cards = [];
  if (awards.fastest) cards.push({ icon: '⚡', title: 'الأسرع', name: awards.fastest.name });
  if (awards.bestPainter) cards.push({ icon: '🎨', title: 'أفضل رسام', name: awards.bestPainter.name, extra: `${awards.bestPainter.reactions} تفاعل` });
  if (awards.funniestBook) cards.push({ icon: '😂', title: 'أفضل تحول هزلي', name: awards.funniestBook.ownerName, extra: `${awards.funniestBook.reactions} تفاعل` });
  grid.innerHTML = cards.length
    ? cards.map((c) => `<div class="award-card"><div class="award-icon">${c.icon}</div><div class="award-title">${c.title}</div><div class="award-name">${escapeHtml(c.name || '—')}</div>${c.extra ? `<div class="award-extra">${c.extra}</div>` : ''}</div>`).join('')
    : '<p class="lobby-hint">لا جوائز خاصة هذه المرة — لم يتفاعل أحد بعد!</p>';

  const list = $('#results-scores');
  list.innerHTML = awards.scores.map((s, i) => `<li>${i + 1}. ${s.avatar || '🎨'} <b>${escapeHtml(s.name)}</b> — ${s.score} نقطة</li>`).join('');

  const teamsBox = $('#results-teams');
  if (awards.teamScores) {
    teamsBox.classList.remove('hidden');
    teamsBox.innerHTML = `<span class="team-a">فريق أ: ${awards.teamScores.A}</span> <span class="team-b">فريق ب: ${awards.teamScores.B}</span>`;
  } else teamsBox.classList.add('hidden');

  $('#btn-results-back').classList.toggle('hidden', !state.isHost);
  showScreen('results');
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
