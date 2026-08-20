/* ==========================================================================
   إدارة الألعاب — تُبنى القائمة ديناميكياً من GAME_NAMES + playEvents + gameOrder.
   إجراءات: تعطيل/تفعيل لعبة (gameMaintenance/{tag}) وتعديل إعدادات النقاط (gameSettings/{tag}).
   ملاحظة: فرض الصيانة/النقاط فعلياً يتطلب أن يقرأ ehsmaha هذه الوثائق (README).
   ========================================================================== */
import { fb, OWNER } from "../firebase.js";
import { icon, esc, fmtNum, toast, modal, confirmDialog, $ } from "../lib/ui.js";
import { GAME_NAMES, gameName } from "../lib/model.js";
import { logAudit, session } from "../auth.js";

async function render(view) {
  view.innerHTML = `<div class="page-title">${icon("games")}<span>الألعاب (${Object.keys(GAME_NAMES).length} لعبة)</span></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>اللعبة</th><th>الرمز</th><th>مرات التشغيل</th><th>متوسط المشاركين</th><th>الحالة</th><th>إجراءات</th></tr></thead>
      <tbody id="gm-body"><tr><td colspan="6" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>`;
  await load(view);
}

async function load(view) {
  const body = $("#gm-body", view);
  // إحصاء التشغيل من playEvents
  const counts = {}, parts = {};
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, "playEvents"));
    snap.forEach(d => { const e = d.data(); const g = e.gameTag || e.game || e.tag; if (!g) return; counts[g] = (counts[g] || 0) + 1; parts[g] = (parts[g] || 0) + (e.participants || e.playersCount || 0); });
  } catch (e) { console.warn(e); }

  let maint = new Set();
  try { const m = await fb.getDocs(fb.collection(fb.db, "gameMaintenance")); m.forEach(x => { if (x.data()?.disabled) maint.add(x.id); }); } catch {}

  const tags = [...new Set([...Object.keys(GAME_NAMES), ...Object.keys(counts)])]
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  body.innerHTML = tags.map(tag => {
    const c = counts[tag] || 0;
    const avg = c ? Math.round((parts[tag] || 0) / c) : 0;
    const off = maint.has(tag);
    return `<tr data-tag="${esc(tag)}">
      <td><b>${esc(gameName(tag))}</b></td>
      <td class="muted" style="direction:ltr;font-family:ui-monospace,monospace">${esc(tag)}</td>
      <td>${fmtNum(c)}</td>
      <td>${avg ? fmtNum(avg) : "—"}</td>
      <td>${off ? `<span class="badge badge-ban">صيانة</span>` : `<span class="badge badge-online">مفعّلة</span>`}</td>
      <td><div class="row" style="gap:6px">
        <button class="btn btn-ghost btn-sm" data-a="toggle">${off ? "تفعيل" : "إيقاف مؤقت"}</button>
        <button class="btn btn-ghost btn-sm" data-a="points">${icon("bolt","icon-sm")}<span>النقاط</span></button>
      </div></td></tr>`;
  }).join("");

  body.querySelectorAll("tr[data-tag]").forEach(tr => {
    const tag = tr.dataset.tag;
    tr.querySelector('[data-a="toggle"]').onclick = () => toggleGame(tag, maint.has(tag), view);
    tr.querySelector('[data-a="points"]').onclick = () => editPoints(tag);
  });
}

async function toggleGame(tag, currentlyOff, view) {
  const enable = currentlyOff;
  if (!await confirmDialog(enable ? "تفعيل اللعبة" : "إيقاف اللعبة مؤقتاً",
    `${enable ? "إعادة تفعيل" : "وضع"} «${gameName(tag)}» ${enable ? "" : "في وضع الصيانة على كل المنصة"}؟`,
    { danger: !enable, okLabel: enable ? "تفعيل" : "إيقاف" })) return;
  try {
    await fb.setDoc(fb.doc(fb.db, "gameMaintenance", tag), { disabled: !enable, at: fb.serverTimestamp(), by: session.user?.email || OWNER.email }, { merge: true });
    await logAudit(enable ? "game_enable" : "game_disable", { target: tag });
    toast(enable ? "تم التفعيل" : "تم إيقاف اللعبة مؤقتاً", "ok"); load(view);
  } catch (e) { toast("تعذّر التنفيذ: " + e.message, "err"); }
}

async function editPoints(tag) {
  const { bodyEl } = modal({
    title: `إعدادات نقاط «${gameName(tag)}»`,
    body: `<div class="tbl-empty">${icon("refresh","spin")} تحميل...</div>`,
    actions: [{ label: "إلغاء", cls: "btn-ghost" }, { label: "حفظ", cls: "btn-gold", icon: "check", onClick: (c, b) => savePoints(tag, bodyEl, c, b) }]
  });
  let cur = { points: [10, 8, 5] };
  try { const s = await fb.getDoc(fb.doc(fb.db, "gameSettings", tag)); if (s.exists()) cur = s.data(); } catch {}
  bodyEl.innerHTML = `<p class="dim" style="margin-bottom:12px">مثال: نظام نقاط اللافا 10/8/5 حسب سرعة الإجابة. تُحفظ في <code>gameSettings/${esc(tag)}</code>.</p>
    <textarea id="gs-json" class="textarea" style="min-height:180px;direction:ltr;font-family:ui-monospace,monospace">${esc(JSON.stringify(cur, null, 2))}</textarea>`;
}
async function savePoints(tag, bodyEl, close, btn) {
  let data;
  try { data = JSON.parse(bodyEl.querySelector("#gs-json").value); } catch { return toast("JSON غير صالح", "err"); }
  btn.disabled = true;
  try {
    await fb.setDoc(fb.doc(fb.db, "gameSettings", tag), data, { merge: true });
    await logAudit("game_points", { target: tag, detail: JSON.stringify(data).slice(0, 120) });
    toast("تم حفظ إعدادات النقاط", "ok"); close();
  } catch (e) { toast("تعذّر الحفظ: " + e.message, "err"); btn.disabled = false; }
}

export default { id: "games", title: "الألعاب", icon: "games", render };
