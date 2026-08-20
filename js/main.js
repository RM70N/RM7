/* ==========================================================================
   نقطة التشغيل: يدير المصادقة ثم يبني الهيكل العام (قائمة جانبية + راوتر).
   ========================================================================== */
import { startAuth, session, forceLogout } from "./auth.js";
import { startRealtime, onlineCount, onPresence } from "./lib/data.js";
import { icon, $, toast } from "./lib/ui.js";

import dashboard from "./pages/dashboard.js";
import players from "./pages/players.js";
import streamers from "./pages/streamers.js";
import games from "./pages/games.js";
import messages from "./pages/messages.js";
import clicks from "./pages/clicks.js";
import leaderboard from "./pages/leaderboard.js";
import logs from "./pages/logs.js";
import security from "./pages/security.js";

/* سجل الصفحات (بدون تكرار — كل صفحة كائن {id,title,icon,render,badge?}) */
const PAGES = { dashboard, players, streamers, games, messages, clicks, leaderboard, logs, security };

const NAV = [
  { sep: "الرئيسية" },
  { id: "dashboard" }, { id: "players" }, { id: "clicks" },
  { sep: "الإدارة" },
  { id: "streamers" }, { id: "games" }, { id: "leaderboard" },
  { sep: "التواصل والأمان" },
  { id: "messages" }, { id: "logs" }, { id: "security" }
];

const app = document.getElementById("app");

startAuth(app, () => { startRealtime(); buildShell(); });

function buildShell() {
  app.innerHTML = `
  <div class="app">
    <div class="sidebar-overlay" id="ov"></div>
    <aside class="sidebar" id="sb">
      <div class="brand">
        <div class="brand-mark">${icon("shield","icon-lg")}</div>
        <div class="brand-txt"><b>ادمن احسمها</b><span>لوحة المالك</span></div>
      </div>
      <nav id="nav"></nav>
      <div class="sidebar-foot">
        <div class="nav-item" id="logout">${icon("logout")}<span>تسجيل الخروج</span></div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <button class="btn btn-ghost btn-icon menu-toggle" id="mt">${icon("menu")}</button>
        <h1 id="pg-title">الرئيسية</h1>
        <span class="live-pill">${icon("online","icon-sm")}<span id="live-online">0</span> أونلاين الآن</span>
        <div class="spacer"></div>
        <div class="who">${icon("user","icon-sm")}<span>${session.username}</span></div>
      </div>
      <div class="content" id="view"></div>
    </div>
  </div>`;

  const nav = $("#nav");
  NAV.forEach(item => {
    if (item.sep) { nav.appendChild(mk(`<div class="nav-sep">${item.sep}</div>`)); return; }
    const p = PAGES[item.id];
    const a = mk(`<a class="nav-item" href="#/${item.id}" data-id="${item.id}">
      ${icon(p.icon)}<span>${p.title}</span>
      <span class="badge-count hidden" data-badge="${item.id}"></span></a>`);
    nav.appendChild(a);
  });

  $("#logout").onclick = () => forceLogout();
  $("#mt").onclick = () => { $("#sb").classList.toggle("open"); $("#ov").classList.toggle("show"); };
  $("#ov").onclick = () => { $("#sb").classList.remove("open"); $("#ov").classList.remove("show"); };

  // مؤشر الأونلاين الحيّ في الأعلى
  const paintOnline = () => { const n = $("#live-online"); if (n) n.textContent = onlineCount(); };
  onPresence(paintOnline); paintOnline();

  window.addEventListener("hashchange", route);
  route();
}

function mk(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; }

let cleanup = null;
async function route() {
  const id = (location.hash.replace(/^#\//, "") || "dashboard").split("?")[0];
  const page = PAGES[id] || PAGES.dashboard;
  document.querySelectorAll(".nav-item[data-id]").forEach(a =>
    a.classList.toggle("active", a.dataset.id === (PAGES[id] ? id : "dashboard")));
  $("#pg-title").textContent = page.title;
  $("#sb").classList.remove("open"); $("#ov").classList.remove("show");
  const view = $("#view");
  view.innerHTML = "";
  try { if (typeof cleanup === "function") cleanup(); } catch {}
  cleanup = null;
  try {
    const res = await page.render(view);
    if (typeof res === "function") cleanup = res;   // الصفحة قد تُرجع دالة تنظيف للمستمعات
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card card-pad"><div class="row" style="color:var(--danger)">${icon("alert")}<span>تعذّر تحميل الصفحة: ${e.message || e}</span></div></div>`;
  }
}

/** تحديث شارة عدّاد في القائمة الجانبية (تستدعيه الصفحات، مثل الرسائل غير المقروءة). */
export function setNavBadge(id, count) {
  const b = document.querySelector(`[data-badge="${id}"]`);
  if (!b) return;
  if (count > 0) { b.textContent = count > 99 ? "99+" : count; b.classList.remove("hidden"); }
  else b.classList.add("hidden");
}
window.__setNavBadge = setNavBadge;
