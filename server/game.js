// محرك الغرف والجولات للعبة "رسامين غنام"
// يدير: الغرف، اللاعبين، تناوب الكتابة↔الرسم، والعرض النهائي (الكتاب).
import { randomPhrase } from './phrases.js';
import { cleanText } from './profanity.js';

const PLAYER_COLORS = [
  '#e94f37', '#3f88c5', '#f6ae2d', '#44bba4', '#a06cd5',
  '#ef6f6c', '#2a9d8f', '#e76f51', '#5a7d9a', '#c05299',
  '#8ac926', '#ff924c', '#1982c4', '#6a4c93', '#ff595e',
];

const AVATARS = ['🎨', '🖌️', '🐫', '🦅', '🧑‍🎨', '👑', '🐱', '🌴', '☕', '🚀', '👽', '🦖', '🍔', '🎭', '⚡'];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف ملتبسة
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export class Room {
  constructor(hostSocketId, settings) {
    this.code = genCode();
    this.hostId = null; // playerId للمضيف، يُعيَّن عند انضمام المضيف
    this.locked = false;
    this.isPublic = settings.isPublic ?? false;
    this.settings = {
      mode: settings.mode || 'normal',
      minPlayers: Math.max(3, settings.minPlayers || 3),
      maxPlayers: Math.min(30, settings.maxPlayers || 12),
      roundDuration: settings.roundDuration || 60, // ثوانٍ
      speedMode: settings.speedMode || false, // النمط السريع: الوقت يتناقص
      allowLateJoin: settings.allowLateJoin ?? true,
      family: settings.family ?? false, // الوضع العائلي (فلترة مشددة)
      category: settings.category || null,
      autoStart: settings.autoStart ?? false,
    };
    this.players = new Map(); // id -> player
    this.order = []; // ترتيب اللاعبين (يُثبَّت عند البدء)
    this.state = 'lobby'; // lobby | playing | reveal
    this.game = null;
    this.createdAt = Date.now();
    this._colorIdx = 0;
    this._avatarIdx = 0;
  }

  addPlayer({ name, avatar }, socketId, asHost = false) {
    const id = genId();
    const color = PLAYER_COLORS[this._colorIdx++ % PLAYER_COLORS.length];
    const player = {
      id,
      name: name?.slice(0, 20) || 'لاعب',
      avatar: avatar || AVATARS[this._avatarIdx++ % AVATARS.length],
      color,
      socketId,
      connected: true,
      ready: false,
      isBot: false,
      score: 0,
    };
    this.players.set(id, player);
    if (asHost || this.hostId === null) this.hostId = id;
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.hostId === id) {
      // نقل المضيف لأول لاعب متصل
      const next = [...this.players.values()].find((p) => p.connected && !p.isBot);
      this.hostId = next ? next.id : null;
    }
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  activePlayers() {
    // اللاعبون المشاركون في اللعبة الحالية (بترتيب اللعبة)
    return this.order.map((id) => this.players.get(id)).filter(Boolean);
  }

  publicState() {
    return {
      code: this.code,
      hostId: this.hostId,
      locked: this.locked,
      isPublic: this.isPublic,
      settings: this.settings,
      state: this.state,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        connected: p.connected,
        ready: p.ready,
        isBot: p.isBot,
        score: p.score,
        isHost: p.id === this.hostId,
      })),
    };
  }

  // ===== منطق الجولات (النمط العادي) =====
  startGame() {
    const players = this.connectedPlayers();
    if (players.length < this.settings.minPlayers) {
      return { error: `يجب أن يكون عدد اللاعبين ${this.settings.minPlayers} على الأقل` };
    }
    this.order = players.map((p) => p.id);
    const n = this.order.length;
    this.state = 'playing';
    this.game = {
      round: 0,
      totalRounds: n, // كل كتاب يمر على كل اللاعبين
      books: this.order.map((ownerId) => ({ ownerId, entries: [] })),
      submitted: new Set(),
      deadline: null,
      timer: null,
    };
    return { ok: true };
  }

  // نوع المحتوى المطلوب في جولة معينة: زوجي=كتابة، فردي=رسم
  roundType(round) {
    return round % 2 === 0 ? 'text' : 'drawing';
  }

  currentRoundDuration() {
    let d = this.settings.roundDuration;
    if (this.settings.speedMode && this.game) {
      // النمط السريع: ينقص الوقت مع تقدم الجولات (بحد أدنى 20 ثانية)
      d = Math.max(20, d - this.game.round * 8);
    }
    // الرسم يحتاج وقتًا أطول قليلًا
    if (this.roundType(this.game?.round ?? 0) === 'drawing') d = Math.round(d * 1.5);
    return d;
  }

  // أي كتاب يعمل عليه اللاعب في الجولة الحالية
  bookIndexForPlayer(playerId, round) {
    const n = this.order.length;
    const pIdx = this.order.indexOf(playerId);
    if (pIdx < 0) return -1;
    // الكتاب b يكون بيد اللاعب عند (b + round) % n == pIdx
    return (pIdx - round + n * 10) % n;
  }

  // ما الذي يجب أن يراه اللاعب في هذه الجولة (المحتوى السابق فقط)
  promptForPlayer(playerId) {
    const g = this.game;
    const round = g.round;
    const bookIdx = this.bookIndexForPlayer(playerId, round);
    if (bookIdx < 0) return null;
    const book = g.books[bookIdx];
    const type = this.roundType(round);
    const prev = round > 0 ? book.entries[round - 1] : null;
    return {
      round,
      totalRounds: g.totalRounds,
      type, // ما يجب أن يفعله اللاعب: text | drawing
      previous: prev, // ما يستند إليه (null في الجولة الأولى)
      duration: this.currentRoundDuration(),
      deadline: g.deadline,
    };
  }

  submitEntry(playerId, content) {
    const g = this.game;
    if (!g || this.state !== 'playing') return { error: 'اللعبة ليست في حالة لعب' };
    if (g.submitted.has(playerId)) return { error: 'تم الإرسال مسبقًا' };
    const round = g.round;
    const bookIdx = this.bookIndexForPlayer(playerId, round);
    if (bookIdx < 0) return { error: 'أنت لست ضمن اللعبة الحالية' };
    const type = this.roundType(round);
    let entry;
    if (type === 'text') {
      let text = (content?.text || '').toString().slice(0, 140).trim();
      if (!text) text = '(لم يكتب شيئًا)';
      text = cleanText(text, this.settings.family);
      entry = { type: 'text', authorId: playerId, text };
    } else {
      const strokes = Array.isArray(content?.strokes) ? content.strokes : [];
      entry = { type: 'drawing', authorId: playerId, strokes };
    }
    g.books[bookIdx].entries[round] = entry;
    g.submitted.add(playerId);
    return { ok: true };
  }

  allSubmitted() {
    const g = this.game;
    // فقط اللاعبون المتصلون مطلوب منهم الإرسال؛ المنقطعون يُملأون آليًا
    const need = this.order.filter((id) => {
      const p = this.players.get(id);
      return p && p.connected && !p.isBot;
    });
    return need.every((id) => g.submitted.has(id));
  }

  // ملء تلقائي للاعبين المنقطعين/الروبوتات قبل التقدم
  autofillMissing() {
    const g = this.game;
    const round = g.round;
    const type = this.roundType(round);
    for (const id of this.order) {
      if (g.submitted.has(id)) continue;
      const bookIdx = this.bookIndexForPlayer(id, round);
      const p = this.players.get(id);
      const placeholder =
        type === 'text'
          ? { type: 'text', authorId: id, text: p?.isBot ? '(روبوت غنام)' : '(انقطع اللاعب)' }
          : { type: 'drawing', authorId: id, strokes: [] };
      g.books[bookIdx].entries[round] = placeholder;
      g.submitted.add(id);
    }
  }

  advanceRound() {
    const g = this.game;
    this.autofillMissing();
    g.round += 1;
    g.submitted = new Set();
    if (g.round >= g.totalRounds) {
      this.state = 'reveal';
      return { done: true };
    }
    return { done: false, round: g.round };
  }

  revealData() {
    const g = this.game;
    return {
      books: g.books.map((book) => ({
        ownerId: book.ownerId,
        ownerName: this.players.get(book.ownerId)?.name || 'لاعب',
        entries: book.entries.map((e) => ({
          ...e,
          authorName: this.players.get(e.authorId)?.name || 'لاعب',
          authorAvatar: this.players.get(e.authorId)?.avatar || '🎨',
          authorColor: this.players.get(e.authorId)?.color || '#888',
        })),
      })),
      players: this.publicState().players,
    };
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
  }

  create(settings, socketId) {
    let room;
    do {
      room = new Room(socketId, settings);
    } while (this.rooms.has(room.code));
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  exists(code) {
    return this.rooms.has((code || '').toUpperCase());
  }

  delete(code) {
    const room = this.rooms.get(code);
    if (room?.game?.timer) clearTimeout(room.game.timer);
    this.rooms.delete(code);
  }

  // تنظيف الغرف القديمة الفارغة
  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      const empty = room.connectedPlayers().length === 0;
      const old = now - room.createdAt > 6 * 60 * 60 * 1000;
      if ((empty && now - room.createdAt > 5 * 60 * 1000) || old) {
        this.delete(code);
      }
    }
  }
}
