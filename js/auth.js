/* ==========================================================================
   المصادقة والحماية — أهم جزء.
   - حساب واحد فقط (المالك). لا تسجيل حسابات جديدة إطلاقاً.
   - تحقق مزدوج من هوية المالك (Firebase Auth + isOwner).
   - مصادقة ثنائية 2FA (TOTP) إجبارية.
   - قفل مؤقت بعد محاولات فاشلة + سجل أمني.
   - انتهاء الجلسة بالخمول + إدارة الأجهزة المسجّلة (إنهاء عن بُعد).
   - تسجيل تدقيق (Audit) لكل إجراء إداري.
   ملاحظة أمنية: في نمط "العميل المباشر"، الحماية الفعلية للبيانات من firestore.rules.
   ========================================================================== */
import { fb, OWNER, isOwner } from "./firebase.js";
import { verifyToken, generateSecret, otpauthURL } from "./lib/totp.js";
import { icon, toast, $, el } from "./lib/ui.js";

const IDLE_MINUTES = 20;              // انتهاء الجلسة بعد خمول
const MAX_FAILS = 5;                  // محاولات فاشلة قبل القفل
const LOCK_MINUTES = 15;              // مدة القفل المؤقت
const SEC_DOC = ["adminPanel", "security"];   // adminPanel/security = { totpSecret, createdAt }

/* حالة الجلسة المشتركة */
export const session = {
  user: null,
  username: OWNER.username,
  sessionId: null,
  ready: false
};

/* ---------------- سجلات ---------------- */
/** سجل التدقيق: كل إجراء إداري (من فعل ماذا ومتى). */
export async function logAudit(action, { target = "", detail = "", meta = {} } = {}) {
  try {
    await fb.addDoc(fb.collection(fb.db, "adminAuditLog"), {
      action, target, detail, meta,
      actor: session.username || OWNER.username,
      actorEmail: session.user?.email || "",
      at: fb.serverTimestamp(),
      ua: navigator.userAgent
    });
  } catch (e) { console.warn("audit log failed", e); }
}

/** سجل أمني: محاولات الدخول (ناجحة/فاشلة/قفل). */
async function logSecurity(type, detail = "") {
  try {
    await fb.addDoc(fb.collection(fb.db, "adminSecurityLog"), {
      type, detail, at: fb.serverTimestamp(), ua: navigator.userAgent
    });
  } catch (e) { /* قد تمنعه القواعد قبل المصادقة — نتجاهل بهدوء */ }
}

/* ---------------- القفل المؤقت (best-effort على مستوى الجهاز) ---------------- */
function lockState() { try { return JSON.parse(localStorage.getItem("adm_lock") || "{}"); } catch { return {}; } }
function setLock(v) { localStorage.setItem("adm_lock", JSON.stringify(v)); }
function isLocked() {
  const l = lockState();
  if (l.until && Date.now() < l.until) return Math.ceil((l.until - Date.now()) / 60000);
  return 0;
}
function recordFail() {
  const l = lockState();
  l.fails = (l.fails || 0) + 1;
  if (l.fails >= MAX_FAILS) { l.until = Date.now() + LOCK_MINUTES * 60000; l.fails = 0; }
  setLock(l);
  return l;
}
function clearFails() { setLock({}); }

/* ---------------- إدارة الجلسات / الأجهزة ---------------- */
let sessionUnsub = null;
async function registerSession() {
  session.sessionId = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem("adm_sid", session.sessionId);
  const ref = fb.doc(fb.db, "adminSessions", session.sessionId);
  await fb.setDoc(ref, {
    createdAt: fb.serverTimestamp(), lastActive: fb.serverTimestamp(),
    ua: navigator.userAgent, platform: navigator.platform || "", revoked: false
  });
  // مراقبة الإنهاء عن بُعد: لو حُذف/عُطّل المستند → خروج فوري.
  sessionUnsub = fb.onSnapshot(ref, snap => {
    if (!snap.exists() || snap.data()?.revoked) forceLogout("تم إنهاء هذه الجلسة عن بُعد");
  });
  // نبض حيوية كل دقيقة
  setInterval(() => fb.updateDoc(ref, { lastActive: fb.serverTimestamp() }).catch(() => {}), 60000);
}

/* ---------------- خمول الجلسة ---------------- */
let idleTimer = null;
function armIdle() {
  const reset = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => forceLogout("انتهت الجلسة بسبب الخمول"), IDLE_MINUTES * 60000);
  };
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(ev =>
    document.addEventListener(ev, reset, { passive: true }));
  reset();
}

/* ---------------- خروج ---------------- */
export async function forceLogout(reason = "") {
  try { if (session.sessionId) await fb.deleteDoc(fb.doc(fb.db, "adminSessions", session.sessionId)); } catch {}
  sessionStorage.removeItem("adm_2fa");
  try { sessionUnsub && sessionUnsub(); } catch {}
  await fb.signOut(fb.auth).catch(() => {});
  if (reason) sessionStorage.setItem("adm_logout_reason", reason);
  location.reload();
}

/* ==========================================================================
   واجهة الدخول
   ========================================================================== */
function loginShell(inner) {
  return `<div class="login-wrap"><div class="login-card card card-pad">
    <div class="login-logo">${icon("shield","icon-lg")}</div>
    <h2>ادمن احسمها</h2>
    <div class="sub">لوحة تحكم خاصة — دخول المالك فقط</div>
    ${inner}
  </div></div>`;
}

/** الخطوة 1: بريد/يوزر + كلمة مرور (بدون تسجيل / بدون استرجاع ظاهر). */
function renderPasswordStep(root, onPass) {
  const locked = isLocked();
  const reason = sessionStorage.getItem("adm_logout_reason");
  sessionStorage.removeItem("adm_logout_reason");
  root.innerHTML = loginShell(`
    ${reason ? `<div class="login-err">${icon("info","icon-sm")}<span>${reason}</span></div>` : ""}
    <div id="lg-err" class="login-err hidden"></div>
    <div class="field"><label>البريد الإلكتروني</label>
      <div class="input-icon">${icon("user")}<input id="lg-email" class="input" type="email" autocomplete="username" placeholder="malshaifan1@gmail.com"></div></div>
    <div class="field"><label>كلمة المرور</label>
      <div class="input-icon">${icon("lock")}<input id="lg-pass" class="input" type="password" autocomplete="current-password" placeholder="••••••••"></div></div>
    <button id="lg-btn" class="btn btn-gold btn-block" ${locked ? "disabled" : ""}>${icon("key","icon-sm")}<span>${locked ? `مقفول (${locked} د)` : "دخول"}</span></button>
    <div class="center mt"><button id="lg-google" class="btn btn-ghost btn-block" ${locked ? "disabled" : ""}>الدخول عبر حساب Google المالك</button></div>
  `);
  const errBox = $("#lg-err", root);
  const showErr = (m) => { errBox.textContent = m; errBox.classList.remove("hidden"); };

  const attempt = async (fn) => {
    const lk = isLocked();
    if (lk) { showErr(`الحساب مقفول مؤقتاً. حاول بعد ${lk} دقيقة.`); return; }
    try {
      const cred = await fn();
      const user = cred.user;
      // تحقق من هوية المالك — أي حساب آخر يُرفض ويُسجَّل خروجه فوراً.
      const uname = await resolveUsername(user);
      if (!isOwner(user, uname)) {
        await fb.signOut(fb.auth);
        recordFail();
        await logSecurity("denied", `محاولة دخول بحساب غير مصرّح: ${user.email || ""}`);
        showErr("هذا الحساب غير مصرّح له بالدخول.");
        return;
      }
      clearFails();
      await logSecurity("password_ok", user.email || "");
      onPass(user, uname);
    } catch (e) {
      const l = recordFail();
      await logSecurity("password_fail", (e.code || e.message || "") + "");
      const left = MAX_FAILS - (l.fails || 0);
      showErr(l.until ? `محاولات كثيرة — تم القفل ${LOCK_MINUTES} دقيقة.` :
        `بيانات الدخول غير صحيحة.${left > 0 ? ` (${left} محاولات متبقية)` : ""}`);
      if (l.until) renderPasswordStep(root, onPass);
    }
  };

  $("#lg-btn", root).onclick = () => {
    const email = $("#lg-email", root).value.trim();
    const pass = $("#lg-pass", root).value;
    if (!email || !pass) { showErr("أدخل البريد وكلمة المرور."); return; }
    attempt(() => fb.signInWithEmailAndPassword(fb.auth, email, pass));
  };
  $("#lg-pass", root).addEventListener("keydown", e => { if (e.key === "Enter") $("#lg-btn", root).click(); });
  $("#lg-google", root).onclick = () => attempt(() => fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider()));
}

/** يجلب يوزر المالك من users/{uid} إن وُجد (وإلا يستخدم الافتراضي). */
async function resolveUsername(user) {
  try {
    const s = await fb.getDoc(fb.doc(fb.db, "users", user.uid));
    if (s.exists() && s.data().username) return s.data().username;
  } catch {}
  return OWNER.username;
}

/* ---------------- الخطوة 2: المصادقة الثنائية ---------------- */
async function loadSecret() {
  const s = await fb.getDoc(fb.doc(fb.db, ...SEC_DOC));
  return s.exists() ? (s.data().totpSecret || null) : null;
}

/** إعداد 2FA لأول مرة: توليد سرّ + QR + تحقق ثم حفظه. */
function render2FASetup(root, onDone) {
  const secret = generateSecret();
  const url = otpauthURL(secret, OWNER.username);
  root.innerHTML = loginShell(`
    <div class="login-err hidden" id="tf-err"></div>
    <p class="dim center" style="margin-bottom:14px">فعّل المصادقة الثنائية مرة واحدة: امسح الرمز بتطبيق Authenticator أو أدخل المفتاح يدوياً.</p>
    <div id="qr" class="qr-box"></div>
    <div class="secret-code" id="tf-secret">${secret.replace(/(.{4})/g, "$1 ").trim()}</div>
    <div class="field mt"><label class="center">أدخل الكود الظاهر بالتطبيق للتأكيد</label>
      <input id="tf-code" class="input center" inputmode="numeric" maxlength="6" placeholder="000000" style="letter-spacing:8px;font-size:20px;direction:ltr"></div>
    <button id="tf-btn" class="btn btn-gold btn-block">${icon("shield","icon-sm")}<span>تفعيل وتأكيد</span></button>
  `);
  renderQR($("#qr", root), url, secret);
  const err = $("#tf-err", root);
  $("#tf-btn", root).onclick = async () => {
    const code = $("#tf-code", root).value.trim();
    if (!await verifyToken(secret, code)) {
      err.textContent = "الكود غير صحيح — تأكد من الوقت والتطبيق."; err.classList.remove("hidden"); return;
    }
    await fb.setDoc(fb.doc(fb.db, ...SEC_DOC), { totpSecret: secret, createdAt: fb.serverTimestamp() }, { merge: true });
    await logSecurity("2fa_setup", "تم تفعيل المصادقة الثنائية");
    onDone();
  };
  $("#tf-code", root).addEventListener("keydown", e => { if (e.key === "Enter") $("#tf-btn", root).click(); });
}

/** التحقق من 2FA عند كل دخول. */
function render2FAVerify(root, secret, onDone) {
  root.innerHTML = loginShell(`
    <div class="login-err hidden" id="tf-err"></div>
    <div class="login-logo" style="background:var(--accent-soft);color:var(--accent-light)">${icon("lock","icon-lg")}</div>
    <p class="dim center" style="margin:10px 0 16px">أدخل رمز المصادقة الثنائية من تطبيق Authenticator</p>
    <div class="otp-inputs" id="otp"></div>
    <button id="tf-btn" class="btn btn-gold btn-block">${icon("check","icon-sm")}<span>تأكيد</span></button>
  `);
  const otp = $("#otp", root);
  for (let i = 0; i < 6; i++) otp.appendChild(el(`<input inputmode="numeric" maxlength="1" data-i="${i}">`));
  const inputs = [...otp.querySelectorAll("input")];
  inputs.forEach((inp, i) => {
    inp.addEventListener("input", () => { if (inp.value && i < 5) inputs[i + 1].focus(); if (i === 5 && inp.value) $("#tf-btn", root).click(); });
    inp.addEventListener("keydown", e => { if (e.key === "Backspace" && !inp.value && i > 0) inputs[i - 1].focus(); });
    inp.addEventListener("paste", e => {
      const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      if (d) { e.preventDefault(); d.split("").forEach((c, k) => inputs[k] && (inputs[k].value = c)); inputs[Math.min(d.length, 5)].focus(); }
    });
  });
  inputs[0].focus();
  const err = $("#tf-err", root);
  $("#tf-btn", root).onclick = async () => {
    const code = inputs.map(i => i.value).join("");
    if (await verifyToken(secret, code)) { clearFails(); await logSecurity("2fa_ok", ""); onDone(); }
    else {
      const l = recordFail();
      await logSecurity("2fa_fail", "");
      err.textContent = "الرمز غير صحيح."; err.classList.remove("hidden");
      inputs.forEach(i => i.value = ""); inputs[0].focus();
      if (l.until) forceLogout(`محاولات كثيرة — تم القفل ${LOCK_MINUTES} دقيقة.`);
    }
  };
}

/** يرسم QR عبر مكتبة CDN (تعمل محلياً بالمتصفح — السرّ لا يغادر الجهاز). */
function renderQR(box, url, secret) {
  const fallback = () => { box.innerHTML = `<div style="color:#333;font-size:12px;text-align:center;padding:8px">امسح غير متاح — أدخل المفتاح يدوياً بالأسفل</div>`; };
  if (window.QRCode) { try { new window.QRCode(box, { text: url, width: 190, height: 190, correctLevel: window.QRCode.CorrectLevel.M }); return; } catch { fallback(); return; } }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6/qrcode.min.js";
  s.onload = () => { try { new window.QRCode(box, { text: url, width: 190, height: 190, correctLevel: window.QRCode.CorrectLevel.M }); } catch { fallback(); } };
  s.onerror = fallback;
  document.head.appendChild(s);
}

/* ==========================================================================
   نقطة الدخول: تُدير كامل تدفق المصادقة ثم تنادي onReady.
   ========================================================================== */
export function startAuth(root, onReady) {
  fb.onAuthStateChanged(fb.auth, async (user) => {
    if (!user) { render2FALessLogin(root, onReady); return; }
    const uname = await resolveUsername(user);
    if (!isOwner(user, uname)) { await fb.signOut(fb.auth); render2FALessLogin(root, onReady); return; }
    session.user = user; session.username = uname;

    // إن سبق واجتاز 2FA في هذه الجلسة (نفس علامة التبويب) نكمل مباشرة.
    if (sessionStorage.getItem("adm_2fa") === "1") return finish(onReady);

    let secret;
    try { secret = await loadSecret(); }
    catch { toast("تعذّر قراءة إعدادات الأمان — تحقق من قواعد Firestore", "err", 6000); await fb.signOut(fb.auth); return; }

    if (!secret) render2FASetup(root, () => passed(onReady));
    else render2FAVerify(root, secret, () => passed(onReady));
  });
}
function render2FALessLogin(root, onReady) {
  renderPasswordStep(root, () => { /* onAuthStateChanged سيتكفّل بالباقي */ });
}
function passed(onReady) { sessionStorage.setItem("adm_2fa", "1"); finish(onReady); }
async function finish(onReady) {
  if (session.ready) return;
  session.ready = true;
  await registerSession();
  armIdle();
  await logAudit("login", { detail: "دخول ناجح للوحة" });
  onReady(session.user, session.username);
}

/* ثوابت مُصدّرة للاستخدام في صفحة إدارة الجلسات */
export const AUTH_CONST = { IDLE_MINUTES, MAX_FAILS, LOCK_MINUTES };
