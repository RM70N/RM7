// طبقة تخزين خفيفة (ملف JSON) — تكفي للحسابات الاختيارية، المعرض العام،
// لوحة الصدارة اليومية، إعدادات لوحة التحكم، والإحصائيات.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const FILE = join(DATA_DIR, 'store.json');

function defaultData() {
  return {
    accounts: {}, // token -> { name, score, gamesPlayed, badges: [], avatarsUnlocked: [], createdAt }
    gallery: [], // { id, roomCode, book, publishedAt, votes, ownerName }
    dailyLeaderboard: {}, // 'YYYY-MM-DD' -> [{ name, avatar, reactions, roomCode, at }]
    phraseOverrides: { added: [], removed: [] }, // إدارة بنك العبارات من لوحة التحكم
    profanityOverrides: { added: [], removed: [] },
    announcement: '', // رسالة تظهر في شاشات الانتظار
    stats: { roomsCreated: 0, gamesStarted: 0, modeUsage: {} },
    scheduledRooms: [], // { code, settings, activateAt, hostName }
  };
}

let data = defaultData();

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function load() {
  ensureDir();
  if (existsSync(FILE)) {
    try {
      const raw = JSON.parse(readFileSync(FILE, 'utf-8'));
      data = { ...defaultData(), ...raw };
    } catch {
      data = defaultData();
    }
  } else {
    save();
  }
  return data;
}

let saveTimer = null;
export function save() {
  ensureDir();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch (e) { console.error('store save failed', e); }
  }, 200);
}

export function get() {
  return data;
}

// ===== حسابات =====
export function genToken() {
  return 'acc_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}
export function getOrCreateAccount(token, name) {
  if (!token || !data.accounts[token]) {
    const t = token || genToken();
    data.accounts[t] = { token: t, name: name || 'لاعب', score: 0, gamesPlayed: 0, badges: [], avatarsUnlocked: [], createdAt: Date.now() };
    save();
    return data.accounts[t];
  }
  return data.accounts[token];
}
export function updateAccount(token, patch) {
  if (!data.accounts[token]) return null;
  Object.assign(data.accounts[token], patch);
  save();
  return data.accounts[token];
}
export function awardBadge(token, badge) {
  const acc = data.accounts[token];
  if (!acc) return;
  if (!acc.badges.includes(badge)) acc.badges.push(badge);
  save();
}

// ===== المعرض العام =====
export function publishToGallery(entry) {
  const item = { id: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), publishedAt: Date.now(), votes: 0, ...entry };
  data.gallery.unshift(item);
  data.gallery = data.gallery.slice(0, 300);
  save();
  return item;
}
export function voteGallery(id) {
  const item = data.gallery.find((g) => g.id === id);
  if (item) { item.votes++; save(); }
  return item;
}
export function listGallery(limit = 30) {
  return [...data.gallery].sort((a, b) => b.votes - a.votes || b.publishedAt - a.publishedAt).slice(0, limit);
}

// ===== لوحة الصدارة اليومية =====
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
export function submitDailyScore(entry) {
  const key = todayKey();
  if (!data.dailyLeaderboard[key]) data.dailyLeaderboard[key] = [];
  data.dailyLeaderboard[key].push({ ...entry, at: Date.now() });
  data.dailyLeaderboard[key].sort((a, b) => b.reactions - a.reactions);
  data.dailyLeaderboard[key] = data.dailyLeaderboard[key].slice(0, 100);
  save();
  return data.dailyLeaderboard[key];
}
export function getDailyLeaderboard(key = todayKey()) {
  return data.dailyLeaderboard[key] || [];
}

// ===== إحصائيات =====
export function bumpStat(path) {
  const parts = path.split('.');
  let obj = data.stats;
  for (let i = 0; i < parts.length - 1; i++) {
    obj[parts[i]] = obj[parts[i]] || {};
    obj = obj[parts[i]];
  }
  const last = parts[parts.length - 1];
  obj[last] = (obj[last] || 0) + 1;
  save();
}

// ===== الجدولة =====
export function addScheduledRoom(entry) {
  data.scheduledRooms.push(entry);
  save();
}
export function removeScheduledRoom(code) {
  data.scheduledRooms = data.scheduledRooms.filter((r) => r.code !== code);
  save();
}

load();
