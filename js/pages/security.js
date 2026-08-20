/* ==========================================================================
   الأمان والجلسات — الأجهزة المسجّل دخولها حالياً (إنهاء عن بُعد) + إعدادات.
   يقرأ adminSessions لحظياً؛ إنهاء جلسة = حذف مستندها فيخرج ذلك الجهاز فوراً.
   ========================================================================== */
import { fb } from "../firebase.js";
import { icon, esc, fmtDateTime, timeAgo, toast, confirmDialog, $ } from "../lib/ui.js";
import { session, AUTH_CONST, logAudit } from "../auth.js";

let sub = null;

async function render(view) {
  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-top"><div class="stat-label">انتهاء الجلسة بالخمول</div><div class="stat-ico">${icon("clock")}</div></div><div class="stat-value">${AUTH_CONST.IDLE_MINUTES}<span style="font-size:15px"> دقيقة</span></div></div>
      <div class="stat"><div class="stat-top"><div class="stat-label">محاولات قبل القفل</div><div class="stat-ico gold">${icon("lock")}</div></div><div class="stat-value">${AUTH_CONST.MAX_FAILS}</div></div>
      <div class="stat"><div class="stat-top"><div class="stat-label">مدة القفل المؤقت</div><div class="stat-ico pink">${icon("shield")}</div></div><div class="stat-value">${AUTH_CONST.LOCK_MINUTES}<span style="font-size:15px"> دقيقة</span></div></div>
    </div>

    <div class="page-title" style="margin-top:26px">${icon("eye")}<span>الأجهزة المسجّل دخولها حالياً</span></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>الجهاز</th><th>آخر نشاط</th><th>بدء الجلسة</th><th></th></tr></thead>
      <tbody id="sc-body"><tr><td colspan="4" class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</td></tr></tbody>
    </table></div></div>

    <div class="page-title" style="margin-top:26px">${icon("key")}<span>المصادقة الثنائية</span></div>
    <div class="card card-pad">
      <p class="dim" style="margin-bottom:14px">إعادة تعيين 2FA تحذف المفتاح الحالي وتطلب إعداداً جديداً عند الدخول القادم (استخدمه إذا فقدت جهاز الـ Authenticator).</p>
      <button class="btn btn-danger btn-sm" id="sc-reset2fa">${icon("refresh","icon-sm")}<span>إعادة تعيين المصادقة الثنائية</span></button>
    </div>`;

  sub = fb.onSnapshot(fb.collection(fb.db, "adminSessions"), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !r.revoked)
      .sort((a, b) => ms(b.lastActive) - ms(a.lastActive));
    paint(rows);
  }, err => { const b = $("#sc-body", view); if (b) b.innerHTML = `<tr><td colspan="4" class="tbl-empty" style="color:var(--danger)">تعذّر الجلب: ${esc(err.message)}</td></tr>`; });

  $("#sc-reset2fa", view).onclick = reset2FA;
  return () => { try { sub && sub(); } catch {} };
}

function paint(rows) {
  const body = $("#sc-body"); if (!body) return;
  body.innerHTML = rows.length ? rows.map(r => {
    const isMe = r.id === session.sessionId;
    return `<tr data-id="${esc(r.id)}">
      <td><div class="row" style="gap:9px">${icon("eye","icon-sm")}<div><div class="nm" style="font-size:12px;direction:ltr">${esc((r.ua || "").slice(0, 60))}</div>${isMe ? `<span class="badge badge-gold" style="margin-top:4px">هذا الجهاز</span>` : ""}</div></div></td>
      <td class="muted">${timeAgo(r.lastActive)}</td>
      <td class="muted">${fmtDateTime(r.createdAt)}</td>
      <td>${isMe ? "" : `<button class="btn btn-danger btn-sm" data-a="kill">${icon("power","icon-sm")}<span>إنهاء</span></button>`}</td></tr>`;
  }).join("") : `<tr><td colspan="4" class="tbl-empty">لا توجد جلسات نشطة</td></tr>`;

  body.querySelectorAll('[data-a="kill"]').forEach(b => b.onclick = () => revoke(b.closest("tr").dataset.id));
}

async function revoke(id) {
  if (!await confirmDialog("إنهاء الجلسة", "سيتم إخراج هذا الجهاز فوراً. متابعة؟", { danger: true, okLabel: "إنهاء" })) return;
  try {
    await fb.setDoc(fb.doc(fb.db, "adminSessions", id), { revoked: true }, { merge: true });
    await fb.deleteDoc(fb.doc(fb.db, "adminSessions", id)).catch(() => {});
    await logAudit("session_revoke", { detail: id });
    toast("تم إنهاء الجلسة", "ok");
  } catch (e) { toast("تعذّر الإنهاء: " + e.message, "err"); }
}

async function reset2FA() {
  if (!await confirmDialog("إعادة تعيين 2FA", "سيُحذف مفتاح المصادقة الثنائية الحالي. عند الدخول القادم ستُطالب بإعداد جديد. متابعة؟", { danger: true, okLabel: "إعادة تعيين" })) return;
  try {
    await fb.updateDoc(fb.doc(fb.db, "adminPanel", "security"), { totpSecret: fb.deleteField() });
    await logAudit("2fa_reset", {});
    toast("تمت إعادة التعيين — أعد الدخول لإعداد 2FA", "ok", 5000);
  } catch (e) { toast("تعذّر: " + e.message, "err"); }
}

function ms(v) { return v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : 0); }

export default { id: "security", title: "الأمان والجلسات", icon: "shield", render };
