/* ==========================================================================
   لوحة الشرف — ترتيب اللاعبين بنقاط الأونلاين مع تحكّم يدوي:
   تعديل نقاط لاعب، تجميد النقاط (pointsFrozen)، وإضافة/خصم سريع.
   يكتب مباشرة على users/{uid}.onlinePoints في قاعدة بيانات ehsmaha.
   ========================================================================== */
import { fb, OWNER } from "../firebase.js";
import { icon, esc, fmtNum, toast, modal, $, userCell } from "../lib/ui.js";
import { fetchUsers } from "../lib/data.js";
import { pointsOf, winsOf } from "../lib/model.js";
import { logAudit, session } from "../auth.js";

let users = [];

async function render(view) {
  view.innerHTML = `
    <div class="page-title">${icon("trophy")}<span>لوحة الشرف — ترتيب النقاط</span></div>
    <div class="toolbar"><div class="grow input-icon">${icon("search")}<input id="lb-q" class="input" placeholder="بحث بالاسم..."></div>
      <button class="btn btn-ghost btn-sm" id="lb-refresh">${icon("refresh","icon-sm")}<span>تحديث</span></button></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>#</th><th>اللاعب</th><th>النقاط</th><th>الفوزات</th><th>الحالة</th><th>تحكّم</th></tr></thead>
      <tbody id="lb-body"><tr><td colspan="6" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>`;

  $("#lb-q", view).addEventListener("input", e => paint(e.target.value.trim().toLowerCase()));
  $("#lb-refresh", view).onclick = () => load(view, true);
  await load(view);
}

async function load(view, force) {
  if (force || !users.length) {
    try { users = await fetchUsers(); }
    catch (e) { $("#lb-body").innerHTML = `<tr><td colspan="6" class="tbl-empty" style="color:var(--danger)">تعذّر الجلب: ${esc(e.message)}</td></tr>`; return; }
  }
  paint("");
}

function paint(q) {
  const body = $("#lb-body"); if (!body) return;
  let arr = [...users].sort((a, b) => pointsOf(b) - pointsOf(a));
  const ranked = arr.map((u, i) => ({ ...u, _rank: i + 1 }));
  const shown = q ? ranked.filter(u => (u.username || "").toLowerCase().includes(q) || (u.usernameLower || "").includes(q)) : ranked;
  body.innerHTML = shown.slice(0, 200).map(u => `<tr data-uid="${esc(u.uid)}">
    <td><span class="rank-num ${u._rank<=3?'top'+u._rank:''}">${u._rank}</span></td>
    <td>${userCell(u.username || u.usernameLower || "—", u.email || "", u.photoURL || u.avatar)}</td>
    <td><b class="gold-txt">${fmtNum(pointsOf(u))}</b></td>
    <td>${fmtNum(winsOf(u))}</td>
    <td>${u.pointsFrozen ? `<span class="badge badge-ban">مجمّد</span>` : `<span class="badge badge-online">نشط</span>`}</td>
    <td><div class="row" style="gap:6px">
      <button class="btn btn-ghost btn-sm" data-a="edit">${icon("edit","icon-sm")}<span>تعديل</span></button>
      <button class="btn btn-ghost btn-sm" data-a="freeze">${u.pointsFrozen ? "إلغاء التجميد" : "تجميد"}</button>
    </div></td></tr>`).join("") || `<tr><td colspan="6" class="tbl-empty">لا نتائج</td></tr>`;

  body.querySelectorAll("tr[data-uid]").forEach(tr => {
    const u = users.find(x => x.uid === tr.dataset.uid);
    tr.querySelector('[data-a="edit"]').onclick = () => editPoints(u);
    tr.querySelector('[data-a="freeze"]').onclick = () => toggleFreeze(u);
  });
}

function editPoints(u) {
  modal({
    title: `تعديل نقاط ${u.username || ""}`,
    body: `<div class="field"><label>النقاط الحالية</label><input class="input" value="${pointsOf(u)}" disabled style="direction:ltr"></div>
      <div class="field"><label>القيمة الجديدة (مطلقة)</label><input id="lp-set" class="input" type="number" placeholder="${pointsOf(u)}" style="direction:ltr"></div>
      <div class="field"><label>أو فرق (+/-)</label><input id="lp-delta" class="input" type="number" placeholder="مثال: 50 أو -20" style="direction:ltr"></div>`,
    actions: [
      { label: "إلغاء", cls: "btn-ghost" },
      { label: "حفظ", cls: "btn-gold", icon: "check", onClick: async (close, b) => {
        const setV = $("#lp-set").value, delta = $("#lp-delta").value;
        b.disabled = true;
        try {
          let payload;
          if (setV !== "") payload = { onlinePoints: Number(setV) };
          else if (delta !== "") payload = { onlinePoints: fb.increment(Number(delta)) };
          else { b.disabled = false; return toast("أدخل قيمة أو فرقاً", "err"); }
          await fb.setDoc(fb.doc(fb.db, "users", u.uid), payload, { merge: true });
          u.onlinePoints = setV !== "" ? Number(setV) : pointsOf(u) + Number(delta);
          await logAudit("points_edit", { target: u.username, detail: setV !== "" ? `= ${setV}` : `Δ ${delta}` });
          toast("تم تحديث النقاط", "ok"); close(); paint($("#lb-q").value.trim().toLowerCase());
        } catch (e) { toast("تعذّر الحفظ: " + e.message, "err"); b.disabled = false; }
      } }
    ]
  });
}

async function toggleFreeze(u) {
  const to = !u.pointsFrozen;
  try {
    await fb.setDoc(fb.doc(fb.db, "users", u.uid), { pointsFrozen: to, frozenBy: session.user?.email || OWNER.email }, { merge: true });
    u.pointsFrozen = to;
    await logAudit(to ? "points_freeze" : "points_unfreeze", { target: u.username });
    toast(to ? "تم تجميد النقاط" : "تم إلغاء التجميد", "ok"); paint($("#lb-q").value.trim().toLowerCase());
  } catch (e) { toast("تعذّر التنفيذ: " + e.message, "err"); }
}

export default { id: "leaderboard", title: "لوحة الشرف", icon: "trophy", render };
