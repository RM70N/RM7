/* ==========================================================================
   نموذج البيانات المشترك — أسماء الألعاب، ووصول دفاعي لحقول المستخدم.
   أسماء الألعاب مستخرجة من DOM موقع ehsmaha (بطاقات .gcard[data-tag]).
   ========================================================================== */
import { toDate } from "./ui.js";

/** خريطة رمز اللعبة (gameTag) -> الاسم العربي المعروض للاعبين في ehsmaha. */
export const GAME_NAMES = {
  battery:"الزر المشحون", bomb:"القنبلة المتحركة", box:"الصندوق العشوائي", chairs:"الكرسي المتحرك",
  countrywarparty:"حرب الدول", cr:"سباق الشات", cs:"سرقة التاج", cw:"حرب الدول",
  describechar:"وصف الشخصية", draw:"خمن الرسمة", ev:"التصويت بالإقصاء", fastans:"أسرع جواب",
  findball:"اعثر على الكورة", findballonline:"اعثر على الكورة أونلاين", findballsolo:"اعثر على الكورة",
  guesscountry:"توقع الدولة", guessword:"خمّن الموضوع", gwonline:"خمّن الموضوع أونلاين", gwsolo:"خمّن الموضوع",
  ll:"آخر حرف", lsc:"ترتيب الحروف", main:"اوجد الكلمة", memorybuttons:"حفظ الأزرار",
  obomb:"القنبلة المتحركة أونلاين", odraw:"خمن الرسمة أونلاين", oneletter:"تحدي الحرف الواحد",
  otimer:"لعبة التوقيت أونلاين", otop10:"توب 10 أونلاين", owordrace:"سباق الكلمات السريع أونلاين",
  pdraw:"خمن الرسمة", pgs:"تخمين السعر", ptop10:"توب 10", rlgl:"الضوء الأخضر · الأحمر",
  rou:"الروليت", rw:"عكس الكلمة", sniper:"القناص", timersolo:"لعبة التوقيت", tmr:"لعبة التوقيت",
  tug:"شد الحبل", wai:"من أنا؟", wr:"سباق الكلمات السريع"
};
export function gameName(tag) { return GAME_NAMES[tag] || tag || "—"; }

/** نقاط اللاعب — وصول دفاعي (onlinePoints هو الأساس بحسابات الموقع). */
export function pointsOf(u) {
  return Number(u?.onlinePoints ?? u?.points ?? u?.score ?? 0) || 0;
}
export function winsOf(u) {
  return Number(u?.onlineWinCount ?? u?.wins ?? 0) || 0;
}

/* ---- الحظر: حقول تكتبها هذه اللوحة على users/{uid} ----
   ملاحظة: نظام ehsmaha الأصلي لا يحتوي حقل حظر — نضيف { banned, banUntil, banReason }.
   لفرض الحظر فعلياً على الموقع الأساسي يجب أن يتحقق ehsmaha من هذه الحقول
   (أو تمنعها قواعد Firestore). موضّح في README. */
export function isBanned(u) {
  if (!u?.banned) return false;
  const until = toDate(u.banUntil);
  if (until && until.getTime() < Date.now()) return false;   // انتهت مدة الحظر
  return true;
}
export function banLabel(u) {
  if (!isBanned(u)) return null;
  const until = toDate(u.banUntil);
  return until ? `محظور حتى ${until.toLocaleDateString("ar-SA-u-ca-gregory")}` : "محظور دائم";
}

/** عدد مرات الطرد/التحذير السابقة (حقول تديرها اللوحة). */
export function kicksOf(u) { return Number(u?.kickCount ?? 0) || 0; }
export function warnsOf(u) { return Number(u?.warnCount ?? 0) || 0; }
