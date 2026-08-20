/* ==========================================================================
   الصفحة الرئيسية — إحصائيات شاملة من قاعدة البيانات الحقيقية.
   ========================================================================== */
import { fb } from "../firebase.js";
import { icon, fmtNum, toDate, esc, userCell } from "../lib/ui.js";
import { onlineCount, onPresence, fetchUsers, store, onStreamers } from "../lib/data.js";
import { pointsOf, isBanned, gameName } from "../lib/model.js";

function statCard(label, value, ic, tone = "", sub = "") {
  return `<div class="stat"><div class="stat-top">
      <div><div class="stat-label">${esc(label)}</div></div>
      <div class="stat-ico ${tone}">${icon(ic)}</div></div>
    <div class="stat-value" data-val>${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;
}

/* رسم بياني خطي بسيط (SVG) لآخر N يوم */
function lineChart(points, { w = 640, h = 150 } = {}) {
  const max = Math.max(1, ...points.map(p => p.v));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((p, i) => [i * step, h - (p.v / max) * (h - 24) - 6]);
  const line = coords.map((c, i) => (i ? "L" : "M") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const dots = coords.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3" fill="var(--gold)"/>`).join("");
  const labels = points.map((p, i) => `<text x="${(i*step).toFixed(1)}" y="${h-2}" fill="var(--text-mute)" font-size="9" text-anchor="middle">${p.label}</text>`).join("");
  return `<svg viewBox="0 0 ${w} ${h+12}" width="100%" preserveAspectRatio="none" style="overflow:visible">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(124,58,237,.5)"/><stop offset="1" stop-color="rgba(124,58,237,0)"/></linearGradient></defs>
    <path d="${area}" fill="url(#g1)"/><path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2.5"/>${dots}${labels}</svg>`;
}

function barRow(label, val, max, tone = "gold") {
  const pct = Math.round((val / Math.max(1, max)) * 100);
  return `<div class="mini-row" style="align-items:stretch;flex-direction:column;gap:6px">
    <div class="row between"><span class="r-name">${esc(label)}</span><span class="r-val">${fmtNum(val)}</span></div>
    <div style="height:7px;background:var(--bg-1);border-radius:6px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--${tone==='gold'?'gold':'accent-light'}))"></div></div></div>`;
}

async function render(view) {
  view.innerHTML = `
    <div class="page-title">${icon("chart")}<span>نظرة عامة</span></div>
    <div class="stat-grid" id="cards">${skeletons(8)}</div>
    <div class="page-title" style="margin-top:26px">${icon("chart")}<span>التسجيلات الجديدة (آخر 14 يوماً)</span></div>
    <div class="card card-pad" id="chart"><div class="sk" style="height:150px"></div></div>
    <div class="grid-2" style="margin-top:22px">
      <div class="card card-pad"><div class="page-title" style="margin:0 0 12px">${icon("games")}<span>الألعاب الأكثر استخداماً</span></div><div id="games-bd" class="list-scroll">${skeleton()}</div></div>
      <div class="card card-pad"><div class="page-title" style="margin:0 0 12px">${icon("trophy")}<span>أعلى اللاعبين نقاطاً</span></div><div id="top-bd" class="list-scroll">${skeleton()}</div></div>
    </div>`;

  const cards = view.querySelector("#cards");

  // بيانات لحظية للأونلاين
  const paint = () => { const c = cards.querySelector('[data-k="online"] [data-val]'); if (c) c.textContent = fmtNum(onlineCount()); };
  const off1 = onPresence(paint);
  const off2 = onStreamers(() => {
    const s = cards.querySelector('[data-k="streamers"] [data-val]');
    if (s) s.textContent = fmtNum(store.activeStreamers.length);
  });

  // جلب البيانات الثقيلة مرة واحدة
  const [users, playEvents, feedback] = await Promise.all([
    fetchUsers(),
    safeGetAll("playEvents"),
    safeGetAll("feedback")
  ]);

  const now = new Date();
  const startOf = (days) => { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - days); return d; };
  const created = users.map(u => toDate(u.createdAt)).filter(Boolean);
  const newToday = created.filter(d => d >= startOf(0)).length;
  const newWeek = created.filter(d => d >= startOf(6)).length;
  const newMonth = created.filter(d => d >= startOf(29)).length;
  const banned = users.filter(isBanned).length;
  const unread = feedback.filter(f => (f.status ? f.status === "new" : !f.read)).length;

  cards.innerHTML =
    wrap("players", statCard("إجمالي اللاعبين", fmtNum(users.length), "players", "", `<span class="up">+${newToday}</span> اليوم`)) +
    wrap("online", statCard("أونلاين الآن", fmtNum(onlineCount()), "online", "green", "لحظي")) +
    wrap("week", statCard("تسجيلات هذا الأسبوع", fmtNum(newWeek), "user", "gold", `الشهر: ${fmtNum(newMonth)}`)) +
    wrap("plays", statCard("إجمالي الألعاب المُلعَبة", fmtNum(playEvents.length), "games", "pink")) +
    wrap("streamers", statCard("ستريمرز نشطون الآن", fmtNum(store.activeStreamers.length), "streamers", "gold")) +
    wrap("banned", statCard("حسابات محظورة", fmtNum(banned), "ban", "")) +
    wrap("fb", statCard("رسائل الدعم", fmtNum(feedback.length), "messages", "green", `${fmtNum(unread)} غير مقروء`)) +
    wrap("sessions", statCard("عدد البثوث/الجلسات", fmtNum(countSessions(playEvents)), "streamers", "pink"));

  // الرسم البياني
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = startOf(i); const d2 = startOf(i - 1);
    const v = created.filter(x => x >= d && x < d2).length;
    days.push({ v, label: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  view.querySelector("#chart").innerHTML = lineChart(days);

  // الألعاب الأكثر استخداماً
  const byGame = {};
  playEvents.forEach(e => { const g = e.gameTag || e.game || e.tag || e.gameId; if (g) byGame[g] = (byGame[g] || 0) + 1; });
  const gameArr = Object.entries(byGame).sort((a, b) => b[1] - a[1]);
  const gmax = gameArr[0]?.[1] || 1;
  view.querySelector("#games-bd").innerHTML = gameArr.length
    ? gameArr.slice(0, 12).map(([g, c]) => barRow(gameName(g), c, gmax)).join("")
    : `<div class="tbl-empty">لا توجد بيانات playEvents بعد</div>`;

  // أعلى اللاعبين نقاطاً
  const top = [...users].sort((a, b) => pointsOf(b) - pointsOf(a)).slice(0, 12);
  view.querySelector("#top-bd").innerHTML = top.map((u, i) => `
    <div class="mini-row"><span class="rank-num ${i<3?'top'+(i+1):''}">${i+1}</span>
      ${userCell(u.username || u.usernameLower || "—", u.email || "", u.photoURL || u.avatar)}
      <span class="r-val">${fmtNum(pointsOf(u))}</span></div>`).join("") || `<div class="tbl-empty">لا يوجد لاعبون</div>`;

  return () => { off1(); off2(); };
}

function wrap(k, html){ return html.replace('<div class="stat">', `<div class="stat" data-k="${k}">`); }
function skeletons(n){ return Array.from({length:n}, () => `<div class="stat"><div class="sk" style="height:78px"></div></div>`).join(""); }
function skeleton(){ return `<div class="sk" style="height:120px"></div>`; }
async function safeGetAll(col){ try { const s = await fb.getDocs(fb.collection(fb.db, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); } catch(e){ console.warn(col, e); return []; } }
function countSessions(ev){ const set = new Set(); ev.forEach(e => { const s = e.sessionId || e.roomId || e.streamer || e.broadcastId; if (s) set.add(s); }); return set.size || ev.length; }

export default { id: "dashboard", title: "الرئيسية", icon: "dashboard", render };
