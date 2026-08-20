/* ==========================================================================
   مكوّنات واجهة قابلة لإعادة الاستخدام: أيقونات SVG، Toast، Modal، مساعدات DOM.
   (بدون إيموجيز — كل الأيقونات SVG stroke).
   ========================================================================== */

/* ---------- أيقونات SVG (مسارات فقط، تُغلّف بـ svg) ---------- */
const ICON_PATHS = {
  dashboard:'<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z"/>',
  players:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  streamers:'<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  games:'<line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  messages:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  logs:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3"/>',
  clicks:'<path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2 8 5M5.9 5.9 3.9 3.9M2.2 7.2 5 8M2 12h3M5.9 15.1l-2 2"/>',
  search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  send:'<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  ban:'<circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>',
  kick:'<path d="M18 6L6 18M6 6l12 12"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  history:'<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  online:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>',
  bolt:'<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  check:'<polyline points="20 6 9 17 4 12"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  menu:'<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  chart:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  power:'<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  refresh:'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  medal:'<circle cx="12" cy="8" r="6"/><path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1"/>',
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  key:'<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 0-1.4 1.4L15 21l2-2 2 2 3-3-6.6-6.6z"/>'
};

/** يبني أيقونة SVG بالاسم. cls: أصناف إضافية. */
export function icon(name, cls = "") {
  const p = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}

/* ---------- مساعدات DOM ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

/* ---------- Toast ---------- */
export function toast(msg, type = "info", ms = 3400) {
  let box = $("#toasts");
  if (!box) { box = el('<div id="toasts"></div>'); document.body.appendChild(box); }
  const ic = type === "ok" ? "check" : type === "err" ? "alert" : "info";
  const t = el(`<div class="toast toast-${type}"><div class="ico">${icon(ic,"icon-sm")}</div><div>${esc(msg)}</div></div>`);
  box.appendChild(t);
  setTimeout(() => { t.classList.add("hide"); setTimeout(() => t.remove(), 250); }, ms);
}

/* ---------- Modal ---------- */
export function modal({ title, body, actions = [], onClose } = {}) {
  const back = el(`<div class="modal-back"></div>`);
  const card = el(`<div class="modal card">
    <div class="modal-head"><h3>${esc(title || "")}</h3>
      <button class="x-btn" data-close>${icon("x")}</button></div>
    <div class="modal-body"></div>
    <div class="modal-foot"></div>
  </div>`);
  const bodyEl = card.querySelector(".modal-body");
  const footEl = card.querySelector(".modal-foot");
  if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const close = () => { back.remove(); document.removeEventListener("keydown", esckey); onClose && onClose(); };
  const esckey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esckey);
  actions.forEach(a => {
    const b = el(`<button class="btn ${a.cls || "btn-ghost"}">${a.icon ? icon(a.icon,"icon-sm") : ""}<span>${esc(a.label)}</span></button>`);
    b.addEventListener("click", () => a.onClick ? a.onClick(close, b) : close());
    footEl.appendChild(b);
  });
  if (!actions.length) footEl.remove();
  back.appendChild(card);
  back.addEventListener("click", e => { if (e.target === back) close(); });
  card.querySelector("[data-close]").addEventListener("click", close);
  document.body.appendChild(back);
  return { close, card, bodyEl };
}

/** تأكيد بسيط (نعم/لا) — يرجّع Promise<boolean> */
export function confirmDialog(title, message, { danger = false, okLabel = "تأكيد" } = {}) {
  return new Promise(res => {
    modal({
      title,
      body: `<p class="dim">${esc(message)}</p>`,
      actions: [
        { label: "إلغاء", cls: "btn-ghost", onClick: c => { c(); res(false); } },
        { label: okLabel, cls: danger ? "btn-danger" : "btn-purple", onClick: c => { c(); res(true); } }
      ],
      onClose: () => res(false)
    });
  });
}

/* ---------- تنسيق ---------- */
export function fmtNum(n) { return (n ?? 0).toLocaleString("en-US"); }

/** يحوّل قيمة وقت Firestore (Timestamp/رقم/تاريخ) إلى Date أو null. */
export function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  if (v.seconds != null) return new Date(v.seconds * 1000);
  const d = new Date(v); return isNaN(d) ? null : d;
}

const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
export function timeAgo(v) {
  const d = toDate(v); if (!d) return "—";
  const s = Math.round((d - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(Math.round(s), "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 2592000) return rtf.format(Math.round(s / 86400), "day");
  return rtf.format(Math.round(s / 2592000), "month");
}
export function fmtDate(v) {
  const d = toDate(v); if (!d) return "—";
  return d.toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "short", day: "numeric" });
}
export function fmtDateTime(v) {
  const d = toDate(v); if (!d) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" });
}

/** أول حرف من الاسم للأفاتار البديل */
export function initial(name) { return (String(name || "؟").trim()[0] || "؟").toUpperCase(); }

/** خلية مستخدم (أفاتار + اسم + سطر فرعي) */
export function userCell(name, sub = "", avatarUrl = "") {
  const av = avatarUrl
    ? `<img class="av" src="${esc(avatarUrl)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'av-fb',textContent:'${esc(initial(name))}'}))">`
    : `<div class="av-fb">${esc(initial(name))}</div>`;
  return `<div class="user-cell">${av}<div><div class="nm">${esc(name || "—")}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div>`;
}
