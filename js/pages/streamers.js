/* ==========================================================================
   إدارة الستريمرز — من activeStreamers (لحظي) و leaderboards/{streamer}.
   إجراءات: تعطيل/تفعيل صلاحية ستريمر (streamerDisabled/{lower}) وتعديل الأوفرلاي.
   ملاحظة: فرض التعطيل فعلياً يتطلب أن يقرأ ehsmaha هذه الوثيقة (موضّح في README).
   ========================================================================== */
import { fb, OWNER } from "../firebase.js";
import { icon, esc, fmtNum, toast, modal, confirmDialog, $, userCell } from "../lib/ui.js";
import { store, onStreamers } from "../lib/data.js";
import { gameName } from "../lib/model.js";
import { logAudit, session } from "../auth.js";

async function render(view) {
  view.innerHTML = `
    <div class="page-title">${icon("streamers")}<span>الستريمرز على المنصة</span></div>
    <div id="st-live" class="stat-grid"></div>
    <div class="page-title" style="margin-top:26px">${icon("trophy")}<span>كل الستريمرز (من لوحات المتصدرين)</span></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>الستريمر</th><th>عدد البثوث</th><th>مشاهدون مشاركون</th><th>الألعاب المفضّلة</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody id="st-body"><tr><td colspan="6" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>`;

  const off = onStreamers(paintLive);
  paintLive();
  await loadTable(view);
  return off;
}

function paintLive() {
  const box = $("#st-live"); if (!box) return;
  const live = store.activeStreamers;
  box.innerHTML = `
    <div class="stat"><div class="stat-top"><div class="stat-label">ستريمرز نشطون الآن</div><div class="stat-ico green">${icon("online")}</div></div><div class="stat-value">${fmtNum(live.length)}</div><div class="stat-sub">لحظي</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-label">إجمالي المشاهدين المشاركين</div><div class="stat-ico gold">${icon("users")}</div></div><div class="stat-value">${fmtNum(live.reduce((s, x) => s + (x.viewers || x.participants || 0), 0))}</div></div>`;
}

async function loadTable(view) {
  const body = $("#st-body", view);
  let streamers = [];
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, "leaderboards"));
    streamers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { body.innerHTML = `<tr><td colspan="6" class="tbl-empty" style="color:var(--danger)">تعذّر الجلب: ${esc(e.message)}</td></tr>`; return; }

  // حالة التعطيل
  let disabled = new Set();
  try { const d = await fb.getDocs(fb.collection(fb.db, "streamerDisabled")); d.forEach(x => disabled.add(x.id)); } catch {}

  const liveNames = new Set(store.activeStreamers.map(s => (s.username || s.streamer || s.id || "").toLowerCase()));

  body.innerHTML = streamers.length ? streamers.map(s => {
    const name = s.id;
    const lower = name.toLowerCase();
    const broadcasts = s.broadcastCount ?? s.sessions ?? (Array.isArray(s.entries) ? s.entries.length : "—");
    const viewers = s.totalViewers ?? s.participants ?? "—";
    const fav = Array.isArray(s.favoriteGames) ? s.favoriteGames.map(gameName).join("، ") : (s.topGame ? gameName(s.topGame) : "—");
    const isDis = disabled.has(lower);
    const isLive = liveNames.has(lower);
    return `<tr data-name="${esc(name)}" data-lower="${esc(lower)}">
      <td>${userCell(name, isLive ? "على الهواء الآن" : "")}</td>
      <td>${typeof broadcasts === "number" ? fmtNum(broadcasts) : broadcasts}</td>
      <td>${typeof viewers === "number" ? fmtNum(viewers) : viewers}</td>
      <td class="muted">${esc(fav)}</td>
      <td>${isDis ? `<span class="badge badge-ban">معطّل</span>` : `<span class="badge badge-online">مفعّل</span>`}</td>
      <td><div class="row" style="gap:6px">
        <button class="btn btn-ghost btn-sm" data-a="toggle">${isDis ? "تفعيل" : "تعطيل"}</button>
        <button class="btn btn-ghost btn-sm" data-a="overlay">${icon("edit","icon-sm")}<span>الأوفرلاي</span></button>
      </div></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="tbl-empty">لا يوجد ستريمرز في leaderboards بعد</td></tr>`;

  body.querySelectorAll("tr[data-name]").forEach(tr => {
    const name = tr.dataset.name, lower = tr.dataset.lower;
    tr.querySelector('[data-a="toggle"]')?.addEventListener("click", () => toggleStreamer(name, lower, disabled.has(lower), view));
    tr.querySelector('[data-a="overlay"]')?.addEventListener("click", () => editOverlay(name, lower));
  });
}

async function toggleStreamer(name, lower, currentlyDisabled, view) {
  const enable = currentlyDisabled;
  if (!await confirmDialog(enable ? "تفعيل الستريمر" : "تعطيل الستريمر",
    `${enable ? "إعادة تفعيل" : "منع"} ${name} من استخدام المنصة؟`, { danger: !enable, okLabel: enable ? "تفعيل" : "تعطيل" })) return;
  try {
    if (enable) await fb.deleteDoc(fb.doc(fb.db, "streamerDisabled", lower));
    else await fb.setDoc(fb.doc(fb.db, "streamerDisabled", lower), { disabled: true, at: fb.serverTimestamp(), by: session.user?.email || OWNER.email });
    await logAudit(enable ? "streamer_enable" : "streamer_disable", { target: name });
    toast(enable ? "تم التفعيل" : "تم التعطيل", "ok");
    loadTable(view);
  } catch (e) { toast("تعذّر التنفيذ: " + e.message, "err"); }
}

async function editOverlay(name, lower) {
  const { bodyEl } = modal({
    title: `إعدادات أوفرلاي ${name}`,
    body: `<div class="tbl-empty">${icon("refresh","spin")} تحميل الإعدادات...</div>`,
    actions: [{ label: "إلغاء", cls: "btn-ghost" }, { label: "حفظ", cls: "btn-gold", icon: "check", onClick: (c, b) => saveOverlay(name, lower, bodyEl, c, b) }]
  });
  let cur = {};
  try { const s = await fb.getDoc(fb.doc(fb.db, "moderatorSettings", lower)); if (s.exists()) cur = s.data(); } catch {}
  bodyEl.innerHTML = `<p class="dim" style="margin-bottom:12px">حرّر إعدادات الأوفرلاي (JSON). تُحفظ في <code>moderatorSettings/${esc(lower)}</code>.</p>
    <textarea id="ov-json" class="textarea" style="min-height:200px;direction:ltr;font-family:ui-monospace,monospace">${esc(JSON.stringify(cur, null, 2))}</textarea>`;
}
async function saveOverlay(name, lower, bodyEl, close, btn) {
  let data;
  try { data = JSON.parse(bodyEl.querySelector("#ov-json").value); } catch { return toast("JSON غير صالح", "err"); }
  btn.disabled = true;
  try {
    await fb.setDoc(fb.doc(fb.db, "moderatorSettings", lower), data, { merge: true });
    await logAudit("streamer_overlay", { target: name });
    toast("تم حفظ إعدادات الأوفرلاي", "ok"); close();
  } catch (e) { toast("تعذّر الحفظ: " + e.message, "err"); btn.disabled = false; }
}

export default { id: "streamers", title: "الستريمرز", icon: "streamers", render };
