// محرك الغرف والجولات للعبة "رسامين غنام"
// يدير: الغرف، اللاعبين، الأنماط (Plugin-style)، تناوب الكتابة↔الرسم، والعرض النهائي (الكتاب).
import { cleanText } from './profanity.js';
import { getMode } from './modes/index.js';

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
    this.hostId = null;
    this.locked = false;
    this.isPublic = settings.isPublic ?? false;
    this.settings = {
      mode: settings.mode || 'normal',
      minPlayers: Math.max(2, settings.minPlayers || 3),
      maxPlayers: Math.min(30, settings.maxPlayers || 12),
      roundDuration: settings.roundDuration || 60,
      allowLateJoin: settings.allowLateJoin ?? true,
      family: settings.family ?? false,
      category: settings.category || null,
      autoStart: settings.autoStart ?? false,
      visibility: settings.visibility || 'previous', // previous | full_chain
      teams: settings.teams ?? false,
      dailyChallenge: settings.dailyChallenge ?? false,
      scheduledAt: settings.scheduledAt || null,
      audienceVoting: settings.audienceVoting ?? true,
    };
    this.players = new Map();
    this.order = [];
    this.state = 'lobby'; // lobby | playing | reveal
    this.game = null;
    this.createdAt = Date.now();
    this._colorIdx = 0;
    this._avatarIdx = 0;

    // إشراف/ستريمر
    this.moderation = {
      hiddenPlayers: new Set(), // مخفيون عن شاشة البث فقط
      bannedPlayers: new Set(), // محظورون مؤقتًا من الرسم/الكتابة
      favoritePlayers: new Set(),
      safeMode: false,
      pendingApproved: false, // موافقة الستريمر على عرض الخطوة الحالية في وضع آمن
    };
    this.audience = new Map(); // socketId -> { name, vote }
    this.overlaySockets = new Set();
  }

  mode() {
    return getMode(this.settings.mode);
  }

  addPlayer({ name, avatar }, socketId, asHost = false) {
    const id = genId();
    const color = PLAYER_COLORS[this._colorIdx++ % PLAYER_COLORS.length];
    const player = {
      id,
      name: (name || 'لاعب').toString().slice(0, 20),
      avatar: avatar || AVATARS[this._avatarIdx++ % AVATARS.length],
      color,
      socketId,
      connected: true,
      ready: false,
      isBot: false,
      score: 0,
      team: null,
    };
    this.players.set(id, player);
    if (asHost || this.hostId === null) this.hostId = id;
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.moderation.hiddenPlayers.delete(id);
    this.moderation.bannedPlayers.delete(id);
    this.moderation.favoritePlayers.delete(id);
    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => p.connected && !p.isBot);
      this.hostId = next ? next.id : null;
    }
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
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
        team: p.team,
        isHost: p.id === this.hostId,
        favorite: this.moderation.favoritePlayers.has(p.id),
        banned: this.moderation.bannedPlayers.has(p.id),
        hidden: this.moderation.hiddenPlayers.has(p.id),
      })),
      teamScores: this.settings.teams ? this.teamScores() : null,
      audienceCount: this.audience.size,
    };
  }

  teamScores() {
    const scores = { A: 0, B: 0 };
    for (const p of this.players.values()) if (p.team) scores[p.team] += p.score;
    return scores;
  }

  assignTeams() {
    const ids = [...this.players.keys()];
    ids.forEach((id, i) => { this.players.get(id).team = i % 2 === 0 ? 'A' : 'B'; });
  }

  // ===== بدء اللعبة =====
  startGame(dailyPhrase) {
    const players = this.connectedPlayers();
    if (players.length < this.settings.minPlayers) {
      return { error: `يجب أن يكون عدد اللاعبين ${this.settings.minPlayers} على الأقل` };
    }
    const mode = this.mode();
    this.order = players.map((p) => p.id);
    if (this.settings.teams) this.assignTeams();

    const n = this.order.length;
    this.state = 'playing';

    let books;
    if (mode.bookStructure === 'shared') {
      books = [{ ownerId: null, ownerName: 'الجميع', entries: [], seed: null }];
    } else {
      books = this.order.map((ownerId) => ({
        ownerId,
        entries: [],
        seed: mode.seedEntry ? mode.seedEntry() : null,
      }));
      if (this.settings.dailyChallenge && dailyPhrase) {
        // الجولة الأولى مُعبَّأة مسبقًا بعبارة التحدي اليومي؛ الجميع يبدأ من نفس النقطة
        books.forEach((b) => { b.entries[0] = { type: 'text', authorId: null, authorName: 'تحدي اليوم', text: dailyPhrase, daily: true }; });
      }
    }

    this.game = {
      round: this.settings.dailyChallenge && mode.bookStructure !== 'shared' ? 1 : 0,
      totalRounds: mode.totalRounds(n),
      books,
      submitted: new Set(),
      deadline: null,
      timer: null,
      roundStart: null,
      reactionTally: {}, // "b{book}:e{entry}" -> count
      submitTimes: {}, // playerId -> [ms, ...]
    };
    return { ok: true };
  }

  roundType(round) {
    return this.mode().roundType(round, { room: this });
  }

  currentRoundDuration() {
    const mode = this.mode();
    return mode.roundDuration(this.settings.roundDuration, this.game.round, { room: this });
  }

  // من هم اللاعبون المطلوب منهم التفاعل هذه الجولة
  actingPlayers(round) {
    const mode = this.mode();
    if (mode.bookStructure === 'shared') {
      const n = this.order.length;
      return [this.order[round % n]];
    }
    return this.order;
  }

  bookIndexForPlayer(playerId, round) {
    const mode = this.mode();
    if (mode.bookStructure === 'shared') return 0;
    const n = this.order.length;
    const pIdx = this.order.indexOf(playerId);
    if (pIdx < 0) return -1;
    return (pIdx - round + n * 10) % n;
  }

  promptForPlayer(playerId) {
    const g = this.game;
    const round = g.round;
    const mode = this.mode();
    const acting = this.actingPlayers(round);
    if (!acting.includes(playerId)) return { spectating: true, round, totalRounds: g.totalRounds };

    const bookIdx = this.bookIndexForPlayer(playerId, round);
    if (bookIdx < 0) return null;
    const book = g.books[bookIdx];
    const type = this.roundType(round);
    let previous = round > 0 ? book.entries[round - 1] : (book.seed || null);
    let seedStrokes = [];
    if (round === 0 && book.seed && type === 'drawing') {
      seedStrokes = book.seed.strokes || [];
    } else if (mode.collabDrawing && type === 'drawing' && round >= 2) {
      const prevEntry = book.entries[round - 1];
      if (prevEntry?.type === 'drawing') seedStrokes = prevEntry.strokes || [];
    }
    const result = {
      round, totalRounds: g.totalRounds, type, previous,
      duration: this.currentRoundDuration(), deadline: g.deadline,
      seedStrokes, mode: mode.id, noTimer: !!mode.noTimer,
      banned: this.moderation.bannedPlayers.has(playerId),
    };
    if (this.settings.visibility === 'full_chain' && round > 0) {
      result.chain = book.entries.slice(0, round);
    }
    return result;
  }

  submitEntry(playerId, content) {
    const g = this.game;
    if (!g || this.state !== 'playing') return { error: 'اللعبة ليست في حالة لعب' };
    if (this.moderation.bannedPlayers.has(playerId)) return { error: 'أنت محظور مؤقتًا من المشاركة' };
    if (g.submitted.has(playerId)) return { error: 'تم الإرسال مسبقًا' };
    const round = g.round;
    if (!this.actingPlayers(round).includes(playerId)) return { error: 'ليس دورك في هذه الجولة' };
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
      const strokes = Array.isArray(content?.strokes) ? content.strokes.slice(0, 2000) : [];
      entry = { type: 'drawing', authorId: playerId, strokes };
    }
    g.books[bookIdx].entries[round] = entry;
    g.submitted.add(playerId);

    let scoreEvents = null;
    const mode = this.mode();
    if (mode.scoreOnSubmit) {
      const res = mode.scoreOnSubmit(g.books[bookIdx], round, entry);
      if (res) {
        scoreEvents = res;
        for (const ev of res) {
          const p = this.players.get(ev.authorId);
          if (p) p.score += ev.points;
        }
      }
    }
    return { ok: true, scoreEvents };
  }

  allSubmitted() {
    const g = this.game;
    const need = this.actingPlayers(g.round).filter((id) => {
      const p = this.players.get(id);
      return p && p.connected && !p.isBot;
    });
    return need.every((id) => g.submitted.has(id));
  }

  autofillMissing() {
    const g = this.game;
    const round = g.round;
    const type = this.roundType(round);
    for (const id of this.actingPlayers(round)) {
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
    this.moderation.pendingApproved = false;
    if (g.round >= g.totalRounds) {
      this.state = 'reveal';
      return { done: true };
    }
    return { done: false, round: g.round };
  }

  revealData() {
    const g = this.game;
    const mode = this.mode();
    return {
      mode: mode.id,
      hideAuthorsUntilComplete: !!mode.hideAuthorsUntilComplete,
      teams: this.settings.teams ? this.teamScores() : null,
      books: g.books.map((book) => ({
        ownerId: book.ownerId,
        ownerName: book.ownerId ? (this.players.get(book.ownerId)?.name || 'لاعب') : 'الجميع',
        entries: book.entries.map((e) => ({
          ...e,
          authorName: e.authorId ? (this.players.get(e.authorId)?.name || 'لاعب') : (e.authorName || 'غنام'),
          authorAvatar: e.authorId ? (this.players.get(e.authorId)?.avatar || '🎨') : '🤖',
          authorColor: e.authorId ? (this.players.get(e.authorId)?.color || '#888') : '#888',
        })),
      })),
      players: this.publicState().players,
    };
  }

  registerReaction(bookIndex, entryIndex) {
    const g = this.game;
    if (!g) return null;
    const key = `b${bookIndex}:e${entryIndex}`;
    g.reactionTally[key] = (g.reactionTally[key] || 0) + 1;
    const entry = g.books[bookIndex]?.entries?.[entryIndex];
    if (entry?.authorId) {
      const p = this.players.get(entry.authorId);
      if (p) p.score += 1;
      return { authorId: entry.authorId };
    }
    return null;
  }

  registerSubmitTime(playerId, ms) {
    const g = this.game;
    if (!g) return;
    if (!g.submitTimes[playerId]) g.submitTimes[playerId] = [];
    g.submitTimes[playerId].push(ms);
  }

  computeAwards() {
    const g = this.game;
    if (!g) return null;
    const mode = this.mode();

    // أسرع لاعب (بمعدّل زمن الإرسال)
    let fastest = null, fastestAvg = Infinity;
    for (const [pid, times] of Object.entries(g.submitTimes)) {
      if (!times.length) continue;
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg < fastestAvg) { fastestAvg = avg; fastest = pid; }
    }

    // أفضل رسام: صاحب الرسمة الأعلى تفاعلًا
    let bestPainter = null, bestPainterCount = 0;
    let funniestBookIdx = null, funniestBookCount = -1;
    const bookTotals = g.books.map(() => 0);
    for (const [key, count] of Object.entries(g.reactionTally)) {
      const m = key.match(/^b(\d+):e(\d+)$/);
      if (!m) continue;
      const bIdx = Number(m[1]), eIdx = Number(m[2]);
      bookTotals[bIdx] = (bookTotals[bIdx] || 0) + count;
      const entry = g.books[bIdx]?.entries?.[eIdx];
      if (entry?.type === 'drawing' && count > bestPainterCount) {
        bestPainterCount = count; bestPainter = entry.authorId;
      }
    }
    bookTotals.forEach((total, i) => { if (total > funniestBookCount) { funniestBookCount = total; funniestBookIdx = i; } });

    const scores = [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, team: p.team }))
      .sort((a, b) => b.score - a.score);

    return {
      fastest: fastest ? { playerId: fastest, name: this.players.get(fastest)?.name } : null,
      bestPainter: bestPainter ? { playerId: bestPainter, name: this.players.get(bestPainter)?.name, reactions: bestPainterCount } : null,
      funniestBook: funniestBookIdx !== null && funniestBookCount > 0
        ? { bookIndex: funniestBookIdx, ownerName: g.books[funniestBookIdx].ownerId ? this.players.get(g.books[funniestBookIdx].ownerId)?.name : 'الجميع', reactions: funniestBookCount }
        : null,
      scores,
      teamScores: this.settings.teams ? this.teamScores() : null,
      modeId: mode.id,
    };
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
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
