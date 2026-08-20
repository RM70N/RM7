/* ==========================================================================
   السجلات الأمنية — سجل التدقيق (كل إجراء إداري) + سجل محاولات الدخول.
   يقرأ adminAuditLog و adminSecurityLog (لحظياً).
   ========================================================================== */
import { fb } from "../firebase.js";
import { icon, esc, fmtDateTime, $, $$ } from "../lib/ui.js";

let subA = null, subS = null, audit = [], sec = [], tab = "audit";

const ACTION_LABEL = {
  login: "دخول للوحة", message: "إرسال رسالة", kick: "طرد لاعب", ban: "حظر لاعب", unban: "فك حظر",
  delete_user: "حذف حساب", points_edit: "تعديل نقاط", points_freeze: "تجميد نقاط", points_unfreeze: "إلغاء تجميد",
  streamer_disable: "تعطيل ستريمر", streamer_enable: "تفعيل ستريمر", streamer_overlay: "تعديل أوفرلاي",
  game_disable: "إيقاف لعبة", game_enable: "تفعيل لعبة", game_points: "تعديل نقاط لعبة",
  feedback_reply: "رد على رسالة", feedback_status: "تغيير حالة رسالة"
};
const SEC_LABEL = {
  password_ok: "كلمة مرور صحيحة", password_fail: "فشل كلمة المرور", denied: "حساب مرفوض",
  "2fa_ok": "2FA ناجح", "2fa_fail": "فشل 2FA", "2fa_setup": "تفعيل 2FA"
};
const DANGER = new Set(["delete_user", "ban", "kick", "password_fail", "denied", "2fa_fail"]);

async function render(view) {
  view.innerHTML = `
    <div class="toolbar"><div class="chips" id="lg-tabs">
      <button class="chip active" data-t="audit">سجل الإجراءات (Audit)</button>
      <button class="chip" data-t="security">محاولات الدخول</button>
    </div></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead id="lg-head"></thead>
      <tbody id="lg-body"><tr><td colspan="4" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>`;

  $$("#lg-tabs .chip", view).forEach(c => c.onclick = () => {
    $$("#lg-tabs .chip", view).forEach(x => x.classList.remove("active"));
    c.classList.add("active"); tab = c.dataset.t; paint();
  });

  subA = fb.onSnapshot(fb.collection(fb.db, "adminAuditLog"), s => { audit = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.at) - ms(a.at)); paint(); }, e => console.warn(e));
  subS = fb.onSnapshot(fb.collection(fb.db, "adminSecurityLog"), s => { sec = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.at) - ms(a.at)); paint(); }, e => console.warn(e));

  return () => { try { subA && subA(); subS && subS(); } catch {} };
}

function paint() {
  const head = $("#lg-head"), body = $("#lg-body"); if (!head) return;
  if (tab === "audit") {
    head.innerHTML = `<tr><th>الإجراء</th><th>الهدف</th><th>التفاصيل</th><th>الوقت</th></tr>`;
    body.innerHTML = audit.length ? audit.slice(0, 300).map(r => `<tr>
      <td><span class="badge ${DANGER.has(r.action) ? "badge-ban" : "badge-purple"}">${esc(ACTION_LABEL[r.action] || r.action)}</span></td>
      <td>${esc(r.target || "—")}</td>
      <td class="muted" style="max-width:340px">${esc(r.detail || "—")}</td>
      <td class="muted" style="white-space:nowrap">${fmtDateTime(r.at)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="tbl-empty">لا توجد سجلات بعد</td></tr>`;
  } else {
    head.innerHTML = `<tr><th>الحدث</th><th>التفاصيل</th><th>الجهاز</th><th>الوقت</th></tr>`;
    body.innerHTML = sec.length ? sec.slice(0, 300).map(r => `<tr>
      <td><span class="badge ${DANGER.has(r.type) ? "badge-ban" : "badge-online"}">${esc(SEC_LABEL[r.type] || r.type)}</span></td>
      <td class="muted">${esc(r.detail || "—")}</td>
      <td class="muted" style="max-width:280px;font-size:11px;direction:ltr">${esc((r.ua || "").slice(0, 70))}</td>
      <td class="muted" style="white-space:nowrap">${fmtDateTime(r.at)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="tbl-empty">لا توجد محاولات مسجّلة</td></tr>`;
  }
}
function ms(v) { return v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : 0); }

export default { id: "logs", title: "السجلات الأمنية", icon: "logs", render };
