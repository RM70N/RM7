// خادم "رسامين غنام" — Express لتقديم الملفات + WebSocket للتزامن اللحظي
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import QRCode from 'qrcode';
import { RoomManager } from './game.js';
import { randomPhrase, allCategories } from './phrases.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const manager = new RoomManager();

app.use(express.static(join(__dirname, '..', 'public')));

// REST: التحقق من وجود غرفة (يستخدمه مسار الباركود/الانضمام قبل فتح الاتصال)
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
  });
});

// REST: عبارة عشوائية + الفئات
app.get('/api/phrase', (req, res) => res.json({ phrase: randomPhrase(req.query.category) }));
app.get('/api/categories', (req, res) => res.json({ categories: allCategories() }));

// REST: توليد رمز QR لرابط الانضمام
app.get('/api/qr', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url مطلوب' });
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#1a1423', light: '#ffffff' } });
    res.json({ dataUrl });
  } catch (e) {
    res.status(500).json({ error: 'تعذر توليد الباركود' });
  }
});

// ===== WebSocket =====
let socketSeq = 0;
const sockets = new Map(); // socketId -> { ws, roomCode, playerId }

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptSocketId = null) {
  for (const p of room.players.values()) {
    if (!p.connected || !p.socketId) continue;
    if (p.socketId === exceptSocketId) continue;
    const entry = sockets.get(p.socketId);
    if (entry) send(entry.ws, msg);
  }
}

function sendRoomState(room) {
  broadcast(room, { type: 'roomState', room: room.publicState() });
}

function sendToPlayer(room, playerId, msg) {
  const p = room.players.get(playerId);
  if (p?.socketId) {
    const entry = sockets.get(p.socketId);
    if (entry) send(entry.ws, msg);
  }
}

// بدء جولة: إرسال المطالبة لكل لاعب + ضبط المؤقّت
function startRound(room) {
  const g = room.game;
  const duration = room.currentRoundDuration();
  g.deadline = Date.now() + duration * 1000;
  for (const id of room.order) {
    const prompt = room.promptForPlayer(id);
    sendToPlayer(room, id, { type: 'round', prompt });
  }
  broadcast(room, {
    type: 'roundMeta',
    round: g.round,
    totalRounds: g.totalRounds,
    roundType: room.roundType(g.round),
    deadline: g.deadline,
    submittedCount: 0,
    totalCount: room.order.length,
  });
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(() => finishRound(room), duration * 1000 + 500);
}

function finishRound(room) {
  const g = room.game;
  if (!g || room.state !== 'playing') return;
  if (g.timer) { clearTimeout(g.timer); g.timer = null; }
  const result = room.advanceRound();
  if (result.done) {
    sendReveal(room);
  } else {
    startRound(room);
  }
}

function maybeAdvance(room) {
  if (room.allSubmitted()) finishRound(room);
}

function sendReveal(room) {
  room.state = 'reveal';
  broadcast(room, { type: 'reveal', data: room.revealData() });
}

wss.on('connection', (ws) => {
  const socketId = `s${++socketSeq}`;
  sockets.set(socketId, { ws, roomCode: null, playerId: null });
  ws._socketId = socketId;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handleMessage(ws, socketId, msg);
  });

  ws.on('close', () => {
    const entry = sockets.get(socketId);
    if (entry?.roomCode) {
      const room = manager.get(entry.roomCode);
      if (room && entry.playerId) {
        const p = room.players.get(entry.playerId);
        if (p) {
          p.connected = false;
          p.socketId = null;
        }
        // إذا كنا في اللعب وكل المتصلين أرسلوا، تقدّم
        if (room.state === 'playing') maybeAdvance(room);
        if (room.state === 'lobby') sendRoomState(room);
        else broadcast(room, { type: 'roomState', room: room.publicState() });
      }
    }
    sockets.delete(socketId);
  });
});

function handleMessage(ws, socketId, msg) {
  const entry = sockets.get(socketId);
  switch (msg.type) {
    case 'create': {
      const room = manager.create(msg.settings || {}, socketId);
      const player = room.addPlayer(msg.player || {}, socketId, true);
      entry.roomCode = room.code;
      entry.playerId = player.id;
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
      entry.roomCode = room.code;
      entry.playerId = player.id;
      send(ws, { type: 'joined', code: room.code, playerId: player.id, room: room.publicState() });
      sendRoomState(room);
      // إن كانت اللعبة جارية وسُمح بالدخول المتأخر: أدخله كمتفرّج للجولة الحالية
      if (room.state === 'playing') {
        send(ws, { type: 'spectate', message: 'ستنضم في الجولة القادمة', room: room.publicState() });
      } else if (room.state === 'reveal') {
        send(ws, { type: 'reveal', data: room.revealData() });
      }
      break;
    }
    case 'rejoin': {
      const room = manager.get(msg.code);
      if (!room) return send(ws, { type: 'error', code: 'no_room', message: 'الغرفة غير موجودة' });
      const p = room.players.get(msg.playerId);
      if (!p) return send(ws, { type: 'error', code: 'no_player', message: 'تعذّر استعادة اللاعب' });
      p.connected = true;
      p.socketId = socketId;
      entry.roomCode = room.code;
      entry.playerId = p.id;
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
    case 'ready': {
      const room = manager.get(entry.roomCode);
      if (!room) return;
      const p = room.players.get(entry.playerId);
      if (p) p.ready = !!msg.ready;
      sendRoomState(room);
      // بدء تلقائي عند اكتمال العدد وكل اللاعبين جاهزون
      if (room.settings.autoStart && room.hostId === entry.playerId) { /* المضيف يتحكم */ }
      break;
    }
    case 'updateSettings': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      Object.assign(room.settings, msg.settings || {});
      room.settings.minPlayers = Math.max(3, room.settings.minPlayers);
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
      if (target?.socketId) {
        const tEntry = sockets.get(target.socketId);
        if (tEntry) send(tEntry.ws, { type: 'kicked', message: 'تم طردك من الغرفة' });
      }
      room.removePlayer(msg.playerId);
      sendRoomState(room);
      break;
    }
    case 'start': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      const res = room.startGame();
      if (res.error) return send(ws, { type: 'error', code: 'start', message: res.error });
      broadcast(room, { type: 'gameStart', order: room.order, settings: room.settings });
      startRound(room);
      break;
    }
    case 'submit': {
      const room = manager.get(entry.roomCode);
      if (!room) return;
      const res = room.submitEntry(entry.playerId, msg.content);
      if (res.error) return send(ws, { type: 'submitAck', ok: false, message: res.error });
      send(ws, { type: 'submitAck', ok: true });
      broadcast(room, {
        type: 'progress',
        submittedCount: room.game.submitted.size,
        totalCount: room.order.length,
      });
      maybeAdvance(room);
      break;
    }
    case 'reaction': {
      // تفاعل بالإيموجي في شاشة العرض النهائي
      const room = manager.get(entry.roomCode);
      if (!room) return;
      broadcast(room, { type: 'reaction', bookIndex: msg.bookIndex, entryIndex: msg.entryIndex, emoji: msg.emoji, from: entry.playerId });
      break;
    }
    case 'playAgain': {
      const room = manager.get(entry.roomCode);
      if (!room || room.hostId !== entry.playerId) return;
      room.state = 'lobby';
      room.game = null;
      room.order = [];
      for (const p of room.players.values()) p.ready = false;
      broadcast(room, { type: 'backToLobby', room: room.publicState() });
      break;
    }
    default:
      break;
  }
}

setInterval(() => manager.cleanup(), 60 * 1000);

server.listen(PORT, () => {
  console.log(`رسامين غنام يعمل على http://localhost:${PORT}`);
});
