// خادم "رسامين غنام" — Express لتقديم الملفات + WebSocket للتزامن اللحظي
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import QRCode from 'qrcode';
import { RoomManager } from './game.js';
import { randomPhrase, allCategories, dailyPhrase } from './phrases.js';
import { listModes } from './modes/index.js';
import * as store from './store.js';
import { computeGameBadges } from './badges.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'ghannam2026';
if (!process.env.ADMIN_TOKEN) console.warn('تحذير: لم يُحدَّد ADMIN_TOKEN — يُستخدم رمز افتراضي. عيّن متغيّر البيئة في الإنتاج.');

const app = express();
app.use(express.json());

// CORS: يسمح باستضافة الواجهة (public/) على نطاق منفصل عن الخادم — مثل نشرها
// على Netlify بينما يعمل الخادم على Render/Railway. WebSocket لا يحتاج CORS.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const manager = new RoomManager();

app.use(express.static(join(__dirname, '..', 'public')));

// ===================== REST =====================
app.get('/api/room/:code', (req, res) => {
  const room = manager.get(req.params.code);
  if (!room) return res.json({ exists: false });
  res.json({
    exists: true,
    state: room.state,
    locked: room.locked,
    full: room.connectedPlayers().length >= room.settings.maxPlayers,
    hostName: room.players.get(room.hostId)?.name || null,
    playerCount: room.connectedPlayers().length,
    maxPlayers: room.settings.maxPlayers,
    allowLateJoin: room.settings.allowLateJoin,
    scheduledAt: room.settings.scheduledAt,
  });
});

app.get('/api/phrase', (req, res) => res.json({ phrase: randomPhrase(req.query.category) }));
app.get('/api/categories', (req, res) => res.json({ categories: allCategories() }));
app.get('/api/modes', (req, res) => res.json({ modes: listModes() }));
app.get('/api/announcement', (req, res) => res.json({ text: store.get().announcement || '' }));

app.get('/api/qr', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url مطلوب' });
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#1a1423', light: '#ffffff' } });
    res.json({ dataUrl });
  } catch {
    res.status(500).json({ error: 'تعذّر توليد الباركود' });
  }
});

// ===== التحدي اليومي =====
app.get('/api/daily/phrase', (req, res) => res.json({ phrase: dailyPhrase(), date: store.todayKey() }));
app.get('/api/daily/leaderboard', (req, res) => res.json({ date: store.todayKey(), leaderboard: store.getDailyLeaderboard() }));

// ===== المعرض العام =====
app.get('/api/gallery', (req, res) => res.json({ items: store.listGallery(Number(req.query.limit) || 30) }));
app.post('/api/gallery/:id/vote', (req, res) => {
  const item = store.voteGallery(req.params.id);
  if (!item) return res.status(404).json({ error: 'غير موجود' });
  res.json({ ok: true, votes: item.votes });
});

// ===== حساب اختياري =====
app.post('/api/account', (req, res) => {
  const { token, name } = req.body || {};
  const acc = store.getOrCreateAccount(token, name);
  res.json({ account: acc });
});
app.get('/api/account/:token', (req, res) => {
  const acc = store.get().accounts[req.params.token];
  if (!acc) return res.status(404).json({ error: 'غير موجود' });
  res.json({ account: acc });
});

// ===== دمج دردشة خارجية (Twitch/YouTube/Kick عبر أمر بوت) =====
// يستدعيه أي بوت دردشة (Nightbot/StreamElements/أمر مخصص) عند كتابة أمر مثل: !ارسم أو !صوت
app.post('/api/room/:code/chat-command', (req, res) => {
  const room = manager.get(req.params.code);
  if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
  const { command, user, arg } = req.body || {};
  const cmd = (command || '').replace(/^!/, '').trim();
  if (cmd === 'ارسم' || cmd === 'join' || cmd === 'انضم') {
    const url = `${req.protocol}://${req.get('host')}/join.html?room=${room.code}`;
    return res.json({ ok: true, reply: `انضم عبر: ${url} — الرمز: ${room.code}`, url, code: room.code });
  }
  if (cmd === 'صوت' || cmd === 'vote') {
    if (room.state !== 'reveal') return res.json({ ok: false, reply: 'التصويت متاح فقط أثناء عرض النتائج' });
    const bookIdx = Number(arg);
    if (!Number.isInteger(bookIdx) || !room.game?.books?.[bookIdx]) return res.json({ ok: false, reply: 'رقم كتاب غير صالح' });
    const key = `chat:${user || 'مجهول'}`;
    room.audience.set(key, { name: user || 'مشاهد', vote: bookIdx });
    broadcastAudienceTally(room);
    return res.json({ ok: true, reply: `تم تسجيل صوتك للكتاب رقم ${bookIdx + 1}` });
  }
  res.json({ ok: false, reply: 'أمر غير معروف. جرّب !ارسم أو !صوت <رقم>' });
});

// ===================== لوحة التحكم الإدارية =====================
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'غير مصرّح' });
  next();
}
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const rooms = [...manager.rooms.values()];
  res.json({
    activeRooms: rooms.length,
    totalPlayers: rooms.reduce((s, r) => s + r.connectedPlayers().length, 0),
    rooms: rooms.map((r) => ({ code: r.code, mode: r.settings.mode, state: r.state, players: r.connectedPlayers().length, createdAt: r.createdAt })),
    stats: store.get().stats,
  });
});
app.get('/api/admin/phrases', requireAdmin, (req, res) => res.json({ overrides: store.get().phraseOverrides }));
app.post('/api/admin/phrases', requireAdmin, (req, res) => {
  const { category, phrase } = req.body || {};
  if (!category || !phrase) return res.status(400).json({ error: 'category و phrase مطلوبان' });
  store.get().phraseOverrides.added.push({ category, phrase: phrase.toString().slice(0, 140) });
  store.save();
  res.json({ ok: true });
});
app.delete('/api/admin/phrases', requireAdmin, (req, res) => {
  const { phrase } = req.body || {};
  store.get().phraseOverrides.removed.push(phrase);
  store.get().phraseOverrides.added = store.get().phraseOverrides.added.filter((p) => p.phrase !== phrase);
  store.save();
  res.json({ ok: true });
});
app.get('/api/admin/profanity', requireAdmin, (req, res) => res.json({ overrides: store.get().profanityOverrides }));
app.post('/api/admin/profanity', requireAdmin, (req, res) => {
  const { word } = req.body || {};
  if (!word) return res.status(400).json({ error: 'word مطلوب' });
  store.get().profanityOverrides.added.push(word);
  store.save();
  res.json({ ok: true });
});
app.delete('/api/admin/profanity', requireAdmin, (req, res) => {
  const { word } = req.body || {};
  store.get().profanityOverrides.removed.push(word);
  store.save();
  res.json({ ok: true });
});
app.post('/api/admin/announcement', requireAdmin, (req, res) => {
  store.get().announcement = (req.body?.text || '').toString().slice(0, 300);
  store.save();
  broadcastAnnouncementToAllLobbies();
  res.json({ ok: true });
});
app.delete('/api/admin/room/:code', requireAdmin, (req, res) => {
  const room = manager.get(req.params.code);
  if (!room) return res.status(404).json({ error: 'غير موجودة' });
  broadcast(room, { type: 'kicked', message: 'تم إغلاق الغرفة من قِبل الإدارة' });
  manager.delete(room.code);
  res.json({ ok: true });
});

function broadcastAnnouncementToAllLobbies() {
  const text = store.get().announcement;
  for (const room of manager.rooms.values()) {
    if (room.state === 'lobby') broadcast(room, { type: 'announcement', text });
  }
}

// ===================== WebSocket =====================
let socketSeq = 0;
const sockets = new Map(); // socketId -> { ws, roomCode, playerId, role }

function send(ws, msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }

function broadcast(room, msg, exceptSocketId = null) {
  for (const p of room.players.values()) {
    if (!p.connected || !p.socketId || p.socketId === exceptSocketId) continue;
    const entry = sockets.get(p.socketId);
    if (entry) send(entry.ws, msg);
  }
}
function sendToPlayer(room, playerId, msg) {
  const p = room.players.get(playerId);
  if (p?.socketId) { const entry = sockets.get(p.socketId); if (entry) send(entry.ws, msg); }
}
function broadcastOverlay(room, msg) {
  for (const sid of room.overlaySockets) { const entry = sockets.get(sid); if (entry) send(entry.ws, msg); }
}
function broadcastAudience(room, msg) {
  for (const sid of room.audience.keys()) {
    if (!sid.startsWith('chat:')) { const entry = sockets.get(sid); if (entry) send(entry.ws, msg); }
  }
}
function sendToHost(room, msg) { if (room.hostId) sendToPlayer(room, room.hostId, msg); }

function sendRoomState(room) { broadcast(room, { type: 'roomState', room: room.publicState() }); }

function audienceTally(room) {
  const tally = {};
  for (const a of room.audience.values()) {
    if (a.vote == null) continue;
    tally[a.vote] = (tally[a.vote] || 0) + 1;
  }
  return { tally, total: room.audience.size };
}
function broadcastAudienceTally(room) {
  const data = audienceTally(room);
  sendToHost(room, { type: 'audienceTally', ...data });
  broadcastOverlay(room, { type: 'audienceTally', ...data });
}

// بناء عرض الستريمر (يراعي الإخفاء والوضع الآمن)
function overlayView(room) {
  const mod = room.moderation;
  if (room.state === 'lobby') {
    return { phase: 'lobby', code: room.code, hostName: room.players.get(room.hostId)?.name || '', playerCount: room.connectedPlayers().length };
  }
  if (room.state === 'playing') {
    const g = room.game;
    return {
      phase: 'playing', round: g.round + 1, totalRounds: g.totalRounds,
      roundType: room.roundType(g.round), deadline: g.deadline,
      acting: room.actingPlayers(g.round)
        .filter((id) => !mod.hiddenPlayers.has(id))
        .map((id) => { const p = room.players.get(id); return p ? { name: p.name, avatar: p.avatar } : null; })
        .filter(Boolean),
    };
  }
  if (room.state === 'reveal') {
    const nav = room.revealNav || { bookIndex: 0, entryShown: -1 };
    if (mod.safeMode && !mod.pendingApproved) {
      return { phase: 'reveal', locked: true, bookIndex: nav.bookIndex, message: 'بانتظار موافقة الستريمر لعرض هذه الخطوة' };
    }
    const book = room.game.books[nav.bookIndex];
    if (!book) return { phase: 'reveal', locked: true };
    if (book.ownerId && mod.hiddenPlayers.has(book.ownerId)) {
      return { phase: 'reveal', bookIndex: nav.bookIndex, hidden: true, message: 'هذا المحتوى مخفي من البث' };
    }
    const entries = book.entries.slice(0, nav.entryShown + 1).map((e, i) => {
      if (e.authorId && mod.hiddenPlayers.has(e.authorId)) return { ...e, hidden: true, text: undefined, strokes: [] };
      return e;
    });
    return {
      phase: 'reveal', bookIndex: nav.bookIndex, totalBooks: room.game.books.length,
      ownerName: book.ownerId ? room.players.get(book.ownerId)?.name : 'الجميع',
      entries: entries.map((e) => ({
        ...e,
        authorName: e.authorId ? room.players.get(e.authorId)?.name : (e.authorName || 'غنام'),
        authorAvatar: e.authorId ? room.players.get(e.authorId)?.avatar : '🤖',
      })),
    };
  }
  return { phase: room.state };
}
function pushOverlay(room) { broadcastOverlay(room, { type: 'overlayState', view: overlayView(room) }); }

// ===== دورة الجولات =====
function startRound(room) {
  const g = room.game;
  const duration = room.currentRoundDuration();
  g.deadline = Date.now() + duration * 1000;
  g.roundStart = Date.now();
  const acting = new Set(room.actingPlayers(g.round));
  for (const id of room.order) {
    const prompt = room.promptForPlayer(id);
    sendToPlayer(room, id, { type: 'round', prompt, isActing: acting.has(id) });
  }
  broadcast(room, {
    type: 'roundMeta', round: g.round, totalRounds: g.totalRounds,
    roundType: room.roundType(g.round), deadline: g.deadline, noTimer: room.mode().noTimer,
    submittedCount: 0, totalCount: acting.size,
  });
  pushOverlay(room);
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(() => finishRound(room), duration * 1000 + 500);
}

function finishRound(room) {
  const g = room.game;
  if (!g || room.state !== 'playing') return;
  if (g.timer) { clearTimeout(g.timer); g.timer = null; }
  const result = room.advanceRound();
  if (result.done) sendReveal(room);
  else startRound(room);
}
function maybeAdvance(room) { if (room.allSubmitted()) finishRound(room); }

function sendReveal(room) {
  room.state = 'reveal';
  room.revealNav = { bookIndex: 0, entryShown: -1 };
  const data = room.revealData();
  broadcast(room, { type: 'reveal', data });
  broadcastAudience(room, { type: 'reveal', data });
  pushOverlay(room);
  store.bumpStat('gamesStarted'); // تقريبي: يُحتسب عند اكتمال اللعبة
}

wss.on('connection', (ws) => {
  const socketId = `s${++socketSeq}`;
  sockets.set(socketId, { ws, roomCode: null, playerId: null, role: 'player' });
  ws._socketId = socketId;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    handleMessage(ws, socketId, msg);
  });

  ws.on('close', () => {
    const entry = sockets.get(socketId);
    if (entry?.roomCode) {
      const room = manager.get(entry.roomCode);
      if (room) {
        if (entry.role === 'overlay') { room.overlaySockets.delete(socketId); }
        else if (entry.role === 'audience') { room.audience.delete(socketId); broadcastAudienceTally(room); }
        else if (entry.playerId) {
          const p = room.players.get(entry.playerId);
          if (p) { p.connected = false; p.socketId = null; }
          if (room.state === 'playing') maybeAdvance(room);
          sendRoomState(room);
        }
      }
    }
    sockets.delete(socketId);
  });
});

function handleMessage(ws, socketId, msg) {
  const entry = sockets.get(socketId);
  switch (msg.type) {
    // ===== غرف ولاعبون =====
    case 'create': {
      const room = manager.create(msg.settings || {}, socketId);
      const player = room.addPlayer(msg.player || {}, socketId, true);
      if (msg.accountToken) linkAccount(room, player, msg.accountToken);
      entry.roomCode = room.code; entry.playerId = player.id;
      store.bumpStat('roomsCreated');
      send(ws, { type: 'created', code: room.code, playerId: player.id, room: room.publicState() });
      break;
    }
    case 'join': {
      const room = manager.get(msg.code);
      if (!room) return send(ws, { type: 'error', code: 'no_room', message: 'هذه الغرفة لم تعد متاحة' });
      if (room.locked) return send(ws, { type: 'error', code: 'locked', message: 'الغرفة مقفلة' });
      if (room.connectedPlayers().length >= room.settings.maxPlayers)
        return send(ws, { type: 'error', code: 'full', message: 'الغرفة مكتملة العدد' });
      if (room.state === 'playing' && !room.settings.allowLateJoin)
        return send(ws, { type: 'error', code: 'in_progress', message: 'اللعبة قيد التشغيل، انتظر الجولة القادمة' });
      const player = room.addPlayer(msg.player || {}, socketId, false);
      if (msg.accountToken) linkAccount(room, player, msg.accountToken);
      entry.roomCode = room.code; entry.playerId = player.id;
      send(ws, { type: 'joined', code: room.code, playerId: player.id, room: room.publicState() });
      sendRoomState(room);
      if (room.state === 'playing') send(ws, { type: 'spectate', message: 'ستنضم في الجولة القادمة', room: room.publicState() });
      else if (room.state === 'reveal') send(ws, { type: 'reveal', data: room.revealData() });
      break;
    }
    case 'rejoin': {
      const room = manager.get(msg.code);
      if (!room) return send(ws, { type: 'error', code: 'no_room', message: 'الغرفة غير موجودة' });
      const p = room.players.get(msg.playerId);
      if (!p) return send(ws, { type: 'error', code: 'no_player', message: 'تعذّر استعادة اللاعب' });
      p.connected = true; p.socketId = socketId;
      entry.roomCode = room.code; entry.playerId = p.id;
      send(ws, { type: 'joined', code: room.code, playerId: p.id, room: room.publicState() });
      sendRoomState(room);
      if (room.state === 'playing') {
        const prompt = room.promptForPlayer(p.id);
        if (prompt) send(ws, { type: 'round', prompt, resumed: room.game.submitted.has(p.id) });
      } else if (room.state === 'reveal') {
        send(ws, { type: 'reveal', data: room.revealData() });
      }
      break;
    }
    case 'linkAccount': {
      const room = manager.get(entry.roomCode);
      if (!room || !entry.playerId) return;
      const p = room.players.get(entry.playerId);
      if (p) linkAccount(room, p, msg.token, msg.name);
      break;
    }
    case 'ready': {
      const room = manager.get(entry.roomCode); if (!room) return;
      const p = room.players.get(entry.playerId);
      if (p) p.ready = !!msg.ready;
      sendRoomState(room);
      break;
    }
    case 'updateSettings': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      Object.assign(room.settings, msg.settings || {});
      room.settings.minPlayers = Math.max(2, room.settings.minPlayers);
      room.settings.maxPlayers = Math.min(30, room.settings.maxPlayers);
      if (typeof msg.locked === 'boolean') room.locked = msg.locked;
      if (typeof msg.isPublic === 'boolean') room.isPublic = msg.isPublic;
      sendRoomState(room);
      break;
    }
    case 'kick': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      const target = room.players.get(msg.playerId);
      if (target?.socketId) { const tE = sockets.get(target.socketId); if (tE) send(tE.ws, { type: 'kicked', message: 'تم طردك من الغرفة' }); }
      room.removePlayer(msg.playerId);
      sendRoomState(room);
      break;
    }
    case 'start': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      const phrase = room.settings.dailyChallenge ? dailyPhrase() : null;
      const res = room.startGame(phrase);
      if (res.error) return send(ws, { type: 'error', code: 'start', message: res.error });
      store.bumpStat(`modeUsage.${room.settings.mode}`);
      broadcast(room, { type: 'gameStart', order: room.order, settings: room.settings, dailyPhrase: phrase });
      startRound(room);
      break;
    }
    case 'submit': {
      const room = manager.get(entry.roomCode); if (!room) return;
      const elapsed = room.game?.roundStart ? Date.now() - room.game.roundStart : null;
      const res = room.submitEntry(entry.playerId, msg.content);
      if (res.error) return send(ws, { type: 'submitAck', ok: false, message: res.error });
      if (elapsed != null) room.registerSubmitTime(entry.playerId, elapsed);
      send(ws, { type: 'submitAck', ok: true, scoreEvents: res.scoreEvents });
      broadcast(room, { type: 'progress', submittedCount: room.game.submitted.size, totalCount: room.actingPlayers(room.game.round).length });
      pushOverlay(room);
      maybeAdvance(room);
      break;
    }
    case 'reaction': {
      const room = manager.get(entry.roomCode); if (!room) return;
      const scoreRes = room.registerReaction(msg.bookIndex, msg.entryIndex);
      broadcast(room, { type: 'reaction', bookIndex: msg.bookIndex, entryIndex: msg.entryIndex, emoji: msg.emoji, from: entry.playerId });
      broadcastOverlay(room, { type: 'reaction', bookIndex: msg.bookIndex, entryIndex: msg.entryIndex, emoji: msg.emoji });
      if (scoreRes) sendRoomState(room);
      break;
    }
    case 'revealNav': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      room.revealNav = { bookIndex: msg.bookIndex, entryShown: msg.entryShown };
      room.moderation.pendingApproved = false;
      pushOverlay(room);
      break;
    }
    case 'showResults': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      const awards = room.computeAwards();
      settleAccounts(room, awards);
      if (room.settings.dailyChallenge && awards.funniestBook) {
        store.submitDailyScore({
          name: awards.funniestBook.ownerName, roomCode: room.code,
          reactions: awards.funniestBook.reactions, avatar: '🎨',
        });
      }
      broadcast(room, { type: 'finalResults', awards });
      break;
    }
    case 'publishGallery': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      const book = room.game?.books?.[msg.bookIndex];
      if (!book) return;
      const serialized = {
        ownerName: book.ownerId ? room.players.get(book.ownerId)?.name : 'الجميع',
        entries: book.entries.map((e) => ({
          ...e,
          authorName: e.authorId ? room.players.get(e.authorId)?.name : (e.authorName || 'غنام'),
          authorAvatar: e.authorId ? room.players.get(e.authorId)?.avatar : '🤖',
        })),
      };
      const item = store.publishToGallery({ roomCode: room.code, book: serialized, ownerName: serialized.ownerName });
      send(ws, { type: 'publishedGallery', id: item.id });
      break;
    }
    case 'playAgain': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      room.state = 'lobby'; room.game = null; room.order = []; room.revealNav = null;
      room.moderation.pendingApproved = false;
      for (const p of room.players.values()) { p.ready = false; }
      broadcast(room, { type: 'backToLobby', room: room.publicState() });
      pushOverlay(room);
      break;
    }

    // ===== وضع الستريمر =====
    case 'streamerHide': {
      const room = manager.get(entry.roomCode); if (!room || room.hostId !== entry.playerId) return;
      if (msg.hidden) room.moderation.hiddenPlayers.add(msg.playerId); else room.moderation.hiddenPlayers.delete(msg.playerId);
      sendRoomState(room); pushOverlay(room);
      break;
    }
    case 'streamerBan': {
      const room = manager.get(entry.roomCode); if (!room || room.hostId !== entry.playerId) return;
      if (msg.banned) room.moderation.bannedPlayers.add(msg.playerId); else room.moderation.bannedPlayers.delete(msg.playerId);
      sendRoomState(room);
      break;
    }
    case 'streamerFavorite': {
      const room = manager.get(entry.roomCode); if (!room || room.hostId !== entry.playerId) return;
      if (msg.favorite) room.moderation.favoritePlayers.add(msg.playerId); else room.moderation.favoritePlayers.delete(msg.playerId);
      sendRoomState(room);
      break;
    }
    case 'streamerSafeMode': {
      const room = manager.get(entry.roomCode); if (!room || room.hostId !== entry.playerId) return;
      room.moderation.safeMode = !!msg.enabled;
      room.moderation.pendingApproved = false;
      pushOverlay(room);
      break;
    }
    case 'streamerApprove': {
      const room = manager.get(entry.roomCode); if (!room || room.hostId !== entry.playerId) return;
      room.moderation.pendingApproved = true;
      pushOverlay(room);
      break;
    }

    // ===== عرض البث (OBS) =====
    case 'joinOverlay': {
      const room = manager.get(msg.code);
      if (!room) return send(ws, { type: 'error', code: 'no_room', message: 'الغرفة غير موجودة' });
      entry.roomCode = room.code; entry.role = 'overlay';
      room.overlaySockets.add(socketId);
      send(ws, { type: 'overlayState', view: overlayView(room) });
      break;
    }

    // ===== الجمهور =====
    case 'joinAudience': {
      const room = manager.get(msg.code);
      if (!room) return send(ws, { type: 'error', code: 'no_room', message: 'الغرفة غير موجودة' });
      entry.roomCode = room.code; entry.role = 'audience';
      room.audience.set(socketId, { name: (msg.name || 'مشاهد').slice(0, 20), vote: null });
      send(ws, { type: 'audienceJoined', room: { code: room.code, state: room.state } });
      if (room.state === 'reveal') send(ws, { type: 'reveal', data: room.revealData() });
      broadcastAudienceTally(room);
      break;
    }
    case 'audienceVote': {
      const room = manager.get(entry.roomCode);
      if (!room || entry.role !== 'audience') return;
      const a = room.audience.get(socketId);
      if (a) { a.vote = msg.bookIndex; broadcastAudienceTally(room); }
      break;
    }
    default: break;
  }
}

function linkAccount(room, player, token, name) {
  const acc = store.getOrCreateAccount(token, name || player.name);
  player.accountToken = acc.token;
  const entrySock = sockets.get(player.socketId);
  if (entrySock) send(entrySock.ws, { type: 'accountLinked', account: acc });
}

function settleAccounts(room, awards) {
  for (const p of room.players.values()) {
    if (!p.accountToken) continue;
    const acc = store.get().accounts[p.accountToken];
    if (!acc) continue;
    acc.score += p.score;
    acc.gamesPlayed += 1;
    const badges = computeGameBadges(awards.modeId, awards, p.id);
    for (const b of badges) store.awardBadge(p.accountToken, b);
  }
  store.save();
}

// ===== تنظيف وجدولة =====
setInterval(() => manager.cleanup(), 60 * 1000);
setInterval(() => {
  const now = Date.now();
  for (const room of manager.rooms.values()) {
    if (room.state !== 'lobby' || !room.settings.scheduledAt || !room.settings.autoStart) continue;
    if (now >= room.settings.scheduledAt && room.connectedPlayers().length >= room.settings.minPlayers) {
      const phrase = room.settings.dailyChallenge ? dailyPhrase() : null;
      const res = room.startGame(phrase);
      if (res.ok) {
        broadcast(room, { type: 'gameStart', order: room.order, settings: room.settings, dailyPhrase: phrase });
        startRound(room);
      }
    }
  }
}, 10 * 1000);

server.listen(PORT, () => {
  console.log(`رسامين غنام يعمل على http://localhost:${PORT}`);
});
