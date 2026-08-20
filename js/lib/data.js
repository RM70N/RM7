/* ==========================================================================
   طبقة البيانات المشتركة — استماع لحظي (Real-time) للمجموعات الحقيقية في
   نفس قاعدة بيانات ehsmaha. تُستخدم من عدة صفحات بدون تكرار المنطق.
   المجموعات المكتشفة من ehsmaha (index4):
     users, usernames, presence{username,lastSeen}, activeStreamers, rooms,
     rooms/{id}/game/state, feedback, leaderboards, playEvents, notifications/{uid}/items
   ========================================================================== */
import { fb } from "../firebase.js";
import { toDate } from "./ui.js";

export const ONLINE_WINDOW_MS = 90 * 1000;   // يُعتبر أونلاين إن كان lastSeen خلال 90 ثانية

/** هل presence حديث بما يكفي ليُعدّ أونلاين؟ */
export function isOnlineFrom(lastSeen) {
  const d = toDate(lastSeen); return d ? (Date.now() - d.getTime() < ONLINE_WINDOW_MS) : false;
}

/* ---- مخازن مشتركة حيّة ---- */
export const store = {
  presence: new Map(),        // uid -> {username, lastSeen}
  activeStreamers: [],        // [{id, ...}]
  rooms: new Map(),           // roomId -> data
  _subs: []
};

const listeners = { presence: new Set(), streamers: new Set(), rooms: new Set() };
function emit(key) { listeners[key].forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }

/** يبدأ الاستماع اللحظي مرة واحدة (يُستدعى بعد الدخول). */
export function startRealtime() {
  if (store._started) return; store._started = true;

  store._subs.push(fb.onSnapshot(fb.collection(fb.db, "presence"), snap => {
    store.presence.clear();
    snap.forEach(d => store.presence.set(d.id, d.data()));
    emit("presence");
  }, err => console.warn("presence listen", err)));

  store._subs.push(fb.onSnapshot(fb.collection(fb.db, "activeStreamers"), snap => {
    store.activeStreamers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit("streamers");
  }, err => console.warn("streamers listen", err)));

  store._subs.push(fb.onSnapshot(fb.collection(fb.db, "rooms"), snap => {
    store.rooms.clear();
    snap.forEach(d => store.rooms.set(d.id, { id: d.id, ...d.data() }));
    emit("rooms");
  }, err => console.warn("rooms listen", err)));

  // يعيد تقييم "أونلاين الآن" دورياً (لأن lastSeen يتقادم بدون حدث جديد).
  setInterval(() => emit("presence"), 20000);
}

export function onPresence(fn) { listeners.presence.add(fn); return () => listeners.presence.delete(fn); }
export function onStreamers(fn) { listeners.streamers.add(fn); return () => listeners.streamers.delete(fn); }
export function onRooms(fn) { listeners.rooms.add(fn); return () => listeners.rooms.delete(fn); }

/** قائمة الأونلاين الآن: [{uid, username, lastSeen}] */
export function onlineList() {
  const out = [];
  store.presence.forEach((v, uid) => { if (isOnlineFrom(v.lastSeen)) out.push({ uid, ...v }); });
  return out;
}
export function onlineCount() { return onlineList().length; }

/** يستنتج اللعبة/الغرفة التي يلعبها المستخدم الآن (best-effort من rooms + presence). */
export function currentActivity(uid, user) {
  const roomId = user?.currentRoomId;
  if (roomId && store.rooms.has(roomId)) {
    const r = store.rooms.get(roomId);
    return { roomId, gameTag: r.gameTag || r.game || null, streamer: r.streamer || r.host || null, room: r };
  }
  return null;
}

/** يجلب كل المستخدمين مرة واحدة (getDocs) — للجداول والإحصائيات. */
export async function fetchUsers() {
  const snap = await fb.getDocs(fb.collection(fb.db, "users"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/** يبحث عن uid عبر usernames/{usernameLower} — نفس نمط ehsmaha. */
export async function uidByUsername(username) {
  const lower = String(username || "").trim().toLowerCase().replace(/^@/, "");
  if (!lower) return null;
  const s = await fb.getDoc(fb.doc(fb.db, "usernames", lower));
  return s.exists() ? (s.data().uid || null) : null;
}
