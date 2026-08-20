/* ==========================================================================
   إدارة اللاعبين — الأهم. جدول حقيقي بالبحث/الفلترة/الترتيب/التصفح،
   وإجراءات فعلية تكتب مباشرة على قاعدة بيانات ehsmaha.
   قنوات فعلية مكتشفة من ehsmaha:
     - رسالة للاعب: personalMessages/{usernameLower} = {text,sentAt,position,durationMode,sentBy}
     - الأونلاين: presence/{uid} = {username,lastSeen}
     - سجل الألعاب: playEvents (فلترة بـ uid/username)
   إجراءات تضيفها اللوحة على users/{uid}: {banned,banUntil,banReason,kickCount,...}
   ========================================================================== */
import { fb, OWNER } from "../firebase.js";
import { icon, fmtNum, esc, userCell, fmtDate, timeAgo, toast, modal, confirmDialog, $, $$, fmtDateTime } from "../lib/ui.js";
import { store, onPresence, isOnlineFrom, currentActivity, fetchUsers } from "../lib/data.js";
import { pointsOf, winsOf, isBanned, banLabel, kicksOf, gameName } from "../lib/model.js";
import { logAudit, session } from "../auth.js";

const PAGE_SIZE = 15;
let S = { users: [], q: "", filter: "all", sort: "created", dir: -1, page: 1 };

async function render(view) {
  view.innerHTML = `
    <div class="toolbar">
      <div class="grow input-icon">${icon("search")}<input id="pl-search" class="input" placeholder="بحث بالاسم أو البريد..."></div>
      <div class="chips" id="pl-filters">
        <button class="chip active" data-f="all">الكل</button>
        <button class="chip" data-f="online">أونلاين الآن</button>
        <button class="chip" data-f="banned">محظورون</button>
        <button class="chip" data-f="top">الأكثر نقاطاً</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="pl-refresh">${icon("refresh","icon-sm")}<span>تحديث</span></button>
    </div>
    <div class="card"><div class="tbl-wrap"><table class="tbl" id="pl-tbl">
      <thead><tr>
        <th class="sortable" data-s="username">اللاعب</th>
        <th class="sortable" data-s="created">تاريخ التسجيل</th>
        <th class="sortable" data-s="lastseen">آخر ظهور</th>
        <th>الحالة</th>
        <th>يلعب الآن</th>
        <th class="sortable" data-s="points">النقاط</th>
        <th>طرد/تحذير</th>
        <th>إجراءات</th>
      </tr></thead>
      <tbody id="pl-body"><tr><td colspan="8" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>
    <div class="pager" id="pl-pager"></div>`;

  const off = onPresence(() => paint());   // إعادة الرسم عند تغيّر الأونلاين لحظياً

  $("#pl-search", view).addEventListener("input", e => { S.q = e.target.value.trim().toLowerCase(); S.page = 1; paint(); });
  $$("#pl-filters .chip", view).forEach(c => c.onclick = () => {
    $$("#pl-filters .chip", view).forEach(x => x.classList.remove("active"));
    c.classList.add("active"); S.filter = c.dataset.f; S.page = 1;
    if (S.filter === "top") { S.sort = "points"; S.dir = -1; }
    paint();
  });
  $$("#pl-tbl thead th.sortable", view).forEach(th => th.onclick = () => {
    const s = th.dataset.s;
    if (S.sort === s) S.dir *= -1; else { S.sort = s; S.dir = s === "username" ? 1 : -1; }
    paint();
  });
  $("#pl-refresh", view).onclick = () => load(true);

  await load();
  return off;
}

async function load(force) {
  if (force || !S.users.length) {
    try { S.users = await fetchUsers(); }
    catch (e) { $("#pl-body").innerHTML = `<tr><td colspan="8" class="tbl-empty" style="color:var(--danger)">تعذّر جلب اللاعبين — تحقق من قواعد Firestore (${esc(e.message)})</td></tr>`; return; }
  }
  paint();
}

function enrich(u) {
  const pres = store.presence.get(u.uid);
  const online = pres ? isOnlineFrom(pres.lastSeen) : false;
  const lastSeen = pres?.lastSeen || u.lastSeen || null;
  const act = online ? currentActivity(u.uid, u) : null;
  return { ...u, _online: online, _lastSeen: lastSeen, _act: act };
}

function paint() {
  const body = $("#pl-body"); if (!body) return;
  let rows = S.users.map(enrich);

  if (S.q) rows = rows.filter(u =>
    (u.username || "").toLowerCase().includes(S.q) ||
    (u.usernameLower || "").includes(S.q) ||
    (u.email || "").toLowerCase().includes(S.q));
  if (S.filter === "online") rows = rows.filter(u => u._online);
  if (S.filter === "banned") rows = rows.filter(isBanned);

  const val = (u) => ({
    username: (u.username || u.usernameLower || "").toLowerCase(),
    created: dnum(u.createdAt), lastseen: dnum(u._lastSeen), points: pointsOf(u)
  }[S.sort]);
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * S.dir; });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  S.page = Math.min(S.page, pages);
  const slice = rows.slice((S.page - 1) * PAGE_SIZE, S.page * PAGE_SIZE);

  body.innerHTML = slice.length ? slice.map(rowHtml).join("")
    : `<tr><td colspan="8" class="tbl-empty">لا توجد نتائج</td></tr>`;
  bindRowActions(body);
  renderPager(total, pages);
  updateSortIndicators();
}

function rowHtml(u) {
  const banned = isBanned(u);
  const statusCell = u._online
    ? `<span class="badge badge-online"><span class="dot dot-online"></span> أونلاين</span>`
    : `<span class="badge badge-offline"><span class="dot dot-offline"></span> غير متصل</span>`;
  const playing = u._act
    ? `<div><b class="gold-txt">${esc(gameName(u._act.gameTag))}</b>${u._act.streamer ? `<div class="sub muted">مع ${esc(u._act.streamer)}</div>` : ""}</div>`
    : `<span class="muted">—</span>`;
  const kw = `${fmtNum(kicksOf(u))} / ${fmtNum(u.warnCount || 0)}`;
  return `<tr data-uid="${esc(u.uid)}">
    <td>${userCell(u.username || u.usernameLower || "—", u.email || "", u.photoURL || u.avatar)}
        ${banned ? `<span class="badge badge-ban" style="margin-top:5px">${esc(banLabel(u))}</span>` : ""}</td>
    <td class="muted">${fmtDate(u.createdAt)}</td>
    <td class="muted">${u._lastSeen ? timeAgo(u._lastSeen) : "—"}</td>
    <td>${statusCell}</td>
    <td>${playing}</td>
    <td><b>${fmtNum(pointsOf(u))}</b></td>
    <td class="muted">${kw}</td>
    <td><div class="row" style="gap:6px">
      <button class="btn btn-ghost btn-icon" data-a="msg" title="إرسال رسالة">${icon("send","icon-sm")}</button>
      <button class="btn btn-ghost btn-icon" data-a="kick" title="طرد من الجلسة" ${u._online ? "" : "disabled"}>${icon("kick","icon-sm")}</button>
      <button class="btn btn-ghost btn-icon" data-a="${banned ? "unban" : "ban"}" title="${banned ? "فك الحظر" : "حظر"}">${icon("ban","icon-sm")}</button>
      <button class="btn btn-ghost btn-icon" data-a="log" title="سجل النشاط">${icon("history","icon-sm")}</button>
      <button class="btn btn-danger btn-icon" data-a="del" title="حذف الحساب">${icon("trash","icon-sm")}</button>
    </div></td></tr>`;
}

function bindRowActions(body) {
  body.querySelectorAll("tr[data-uid]").forEach(tr => {
    const uid = tr.dataset.uid;
    const u = S.users.find(x => x.uid === uid); if (!u) return;
    tr.querySelectorAll("[data-a]").forEach(btn => btn.onclick = () => ACTIONS[btn.dataset.a](u));
  });
}

/* ====================== الإجراءات الفعلية ====================== */
const ACTIONS = {
  msg: sendMessage, kick: kickPlayer, ban: banPlayer, unban: unbanPlayer, log: activityLog, del: deletePlayer
};

function sendMessage(u) {
  const lower = (u.usernameLower || u.username || "").toLowerCase();
  modal({
    title: `إرسال رسالة إلى ${u.username || lower}`,
    body: `<div class="field"><label>نص الرسالة</label><textarea id="m-text" class="textarea" placeholder="تظهر للاعب داخل موقع احسمها..."></textarea></div>
      <div class="grid-2"><div class="field"><label>الموضع</label><select id="m-pos" class="select"><option value="top">أعلى الشاشة</option><option value="center">منتصف الشاشة</option></select></div>
      <div class="field"><label>المدة</label><select id="m-dur" class="select"><option value="timed">مؤقتة (تختفي)</option><option value="permanent">دائمة حتى الإغلاق</option></select></div></div>`,
    actions: [
      { label: "إلغاء", cls: "btn-ghost" },
      { label: "إرسال", cls: "btn-purple", icon: "send", onClick: async (close, b) => {
        const text = $("#m-text").value.trim(); if (!text) return toast("اكتب نص الرسالة", "err");
        b.disabled = true;
        try {
          await fb.setDoc(fb.doc(fb.db, "personalMessages", lower), {
            text, sentAt: fb.serverTimestamp(), position: $("#m-pos").value,
            durationMode: $("#m-dur").value, sentBy: session.user?.email || OWNER.email
          });
          await logAudit("message", { target: u.username, detail: text.slice(0, 120) });
          toast("تم إرسال الرسالة", "ok"); close();
        } catch (e) { toast("تعذّر الإرسال: " + e.message, "err"); b.disabled = false; }
      } }
    ]
  });
}

async function kickPlayer(u) {
  const act = currentActivity(u.uid, u);
  if (!await confirmDialog("طرد من الجلسة", `طرد ${u.username || ""} من ${act ? gameName(act.gameTag) : "جلسته الحالية"}؟`, { danger: true, okLabel: "طرد" })) return;
  try {
    const roomId = act?.roomId || u.currentRoomId;
    if (roomId) await fb.deleteDoc(fb.doc(fb.db, "rooms", roomId, "members", u.uid)).catch(() => {});
    await fb.updateDoc(fb.doc(fb.db, "users", u.uid), { currentRoomId: fb.deleteField(), kickCount: fb.increment(1) }).catch(async () => {
      await fb.setDoc(fb.doc(fb.db, "users", u.uid), { kickCount: fb.increment(1) }, { merge: true });
    });
    // إشعار اللاعب بالطرد عبر قناة الرسائل الفعلية
    await fb.setDoc(fb.doc(fb.db, "personalMessages", (u.usernameLower || u.username).toLowerCase()), {
      text: "تم إخراجك من الجلسة الحالية بواسطة الإدارة.", sentAt: fb.serverTimestamp(),
      position: "center", durationMode: "timed", sentBy: session.user?.email || OWNER.email
    }).catch(() => {});
    u.kickCount = kicksOf(u) + 1;
    await logAudit("kick", { target: u.username, detail: roomId ? `room ${roomId}` : "" });
    toast("تم الطرد", "ok"); paint();
  } catch (e) { toast("تعذّر الطرد: " + e.message, "err"); }
}

function banPlayer(u) {
  modal({
    title: `حظر ${u.username || ""}`,
    body: `<div class="field"><label>مدة الحظر</label><select id="b-dur" class="select">
        <option value="1">يوم واحد</option><option value="7">أسبوع</option><option value="30">شهر</option><option value="0">دائم</option></select></div>
      <div class="field"><label>سبب الحظر</label><textarea id="b-reason" class="textarea" placeholder="يُسجّل في سبب الحظر..."></textarea></div>`,
    actions: [
      { label: "إلغاء", cls: "btn-ghost" },
      { label: "تنفيذ الحظر", cls: "btn-danger", icon: "ban", onClick: async (close, b) => {
        const days = Number($("#b-dur").value); const reason = $("#b-reason").value.trim();
        b.disabled = true;
        const banUntil = days > 0 ? fb.Timestamp.fromMillis(Date.now() + days * 86400000) : null;
        try {
          await fb.setDoc(fb.doc(fb.db, "users", u.uid), {
            banned: true, banUntil, banReason: reason || null,
            bannedAt: fb.serverTimestamp(), bannedBy: session.user?.email || OWNER.email
          }, { merge: true });
          Object.assign(u, { banned: true, banUntil, banReason: reason });
          await logAudit("ban", { target: u.username, detail: `${days ? days + " يوم" : "دائم"} — ${reason}` });
          toast("تم الحظر", "ok"); close(); paint();
        } catch (e) { toast("تعذّر الحظر: " + e.message, "err"); b.disabled = false; }
      } }
    ]
  });
}

async function unbanPlayer(u) {
  if (!await confirmDialog("فك الحظر", `فك الحظر عن ${u.username || ""}؟`, { okLabel: "فك الحظر" })) return;
  try {
    await fb.updateDoc(fb.doc(fb.db, "users", u.uid), { banned: false, banUntil: fb.deleteField(), banReason: fb.deleteField() });
    Object.assign(u, { banned: false, banUntil: null, banReason: null });
    await logAudit("unban", { target: u.username });
    toast("تم فك الحظر", "ok"); paint();
  } catch (e) { toast("تعذّر فك الحظر: " + e.message, "err"); }
}

async function activityLog(u) {
  const { bodyEl } = modal({ title: `سجل نشاط ${u.username || ""}`, body: `<div class="list-scroll"><div class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</div></div>`, actions: [{ label: "إغلاق", cls: "btn-ghost" }] });
  try {
    let events = [];
    for (const key of ["uid", "username"]) {
      try {
        const q = fb.query(fb.collection(fb.db, "playEvents"), fb.where(key, "==", key === "uid" ? u.uid : u.username), fb.limit(100));
        const snap = await fb.getDocs(q);
        if (!snap.empty) { events = snap.docs.map(d => ({ id: d.id, ...d.data() })); break; }
      } catch {}
    }
    events.sort((a, b) => dnum(b.at || b.createdAt || b.time) - dnum(a.at || a.createdAt || a.time));
    bodyEl.querySelector(".list-scroll").innerHTML = events.length
      ? events.map(e => `<div class="mini-row"><span class="r-name">${esc(gameName(e.gameTag || e.game || e.tag))}</span>
          <span class="muted" style="margin-inline-start:auto;font-size:12px">${fmtDateTime(e.at || e.createdAt || e.time)}</span></div>`).join("")
      : `<div class="tbl-empty">لا يوجد نشاط مسجّل في playEvents لهذا اللاعب</div>`;
  } catch (e) {
    bodyEl.querySelector(".list-scroll").innerHTML = `<div class="tbl-empty" style="color:var(--danger)">تعذّر الجلب: ${esc(e.message)}</div>`;
  }
}

function deletePlayer(u) {
  modal({
    title: "حذف الحساب نهائياً",
    body: `<div class="login-err">${icon("alert","icon-sm")}<span>إجراء لا يمكن التراجع عنه. سيُحذف حساب <b>${esc(u.username || "")}</b> من قاعدة بيانات احسمها.</span></div>
      <div class="field"><label>اكتب <b class="gold-txt">DELETE</b> للتأكيد</label><input id="d-confirm" class="input" placeholder="DELETE" style="direction:ltr"></div>`,
    actions: [
      { label: "إلغاء", cls: "btn-ghost" },
      { label: "حذف نهائي", cls: "btn-danger", icon: "trash", onClick: async (close, b) => {
        if ($("#d-confirm").value.trim().toUpperCase() !== "DELETE") return toast("اكتب DELETE للتأكيد", "err");
        b.disabled = true;
        const lower = (u.usernameLower || u.username || "").toLowerCase();
        try {
          await fb.deleteDoc(fb.doc(fb.db, "users", u.uid));
          if (lower) await fb.deleteDoc(fb.doc(fb.db, "usernames", lower)).catch(() => {});
          await fb.deleteDoc(fb.doc(fb.db, "presence", u.uid)).catch(() => {});
          if (lower) await fb.deleteDoc(fb.doc(fb.db, "personalMessages", lower)).catch(() => {});
          S.users = S.users.filter(x => x.uid !== u.uid);
          await logAudit("delete_user", { target: u.username, detail: u.uid });
          toast("تم حذف الحساب", "ok"); close(); paint();
        } catch (e) { toast("تعذّر الحذف: " + e.message, "err"); b.disabled = false; }
      } }
    ]
  });
}

/* ====================== أدوات ====================== */
function dnum(v) { if (!v) return 0; if (v.toMillis) return v.toMillis(); if (v.seconds) return v.seconds * 1000; const d = new Date(v); return isNaN(d) ? 0 : d.getTime(); }

function renderPager(total, pages) {
  const p = $("#pl-pager"); if (!p) return;
  const btn = (label, page, dis, active) => `<button class="pbtn ${active ? "active" : ""}" ${dis ? "disabled" : ""} data-p="${page}">${label}</button>`;
  let nums = "";
  const win = 2;
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= S.page - win && i <= S.page + win)) nums += btn(i, i, false, i === S.page);
    else if (i === S.page - win - 1 || i === S.page + win + 1) nums += `<span class="muted">…</span>`;
  }
  p.innerHTML = `<div class="info">${fmtNum(total)} لاعب — صفحة ${S.page} من ${pages}</div>
    <div class="pages">${btn("‹", S.page - 1, S.page <= 1)}${nums}${btn("›", S.page + 1, S.page >= pages)}</div>`;
  p.querySelectorAll(".pbtn[data-p]").forEach(b => b.onclick = () => { const n = +b.dataset.p; if (n >= 1 && n <= pages) { S.page = n; paint(); } });
}

function updateSortIndicators() {
  $$("#pl-tbl thead th.sortable").forEach(th => {
    const base = th.textContent.replace(/[▲▼]/g, "").trim();
    th.innerHTML = base + (S.sort === th.dataset.s ? ` <span class="sort-ind">${S.dir === 1 ? "▲" : "▼"}</span>` : "");
  });
}

export default { id: "players", title: "اللاعبون", icon: "players", render };
