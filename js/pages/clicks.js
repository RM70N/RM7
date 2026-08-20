/* ==========================================================================
   نقرات رابط "احسمها" — عدد النقرات واسم صاحب الحساب الذي نقر.
   تقرأ مجموعة جديدة: ahsemhaLinkClicks/{id} = { username, usernameLower, uid, clickedAt, target }
   هذه المجموعة غير موجودة في ehsmaha بعد — تُملأ بقصاصة التتبّع (tracking-snippet.html)
   التي تُضاف في الموقع الأساسي عند رابط "احسمها".
   ========================================================================== */
import { fb } from "../firebase.js";
import { icon, esc, fmtNum, fmtDateTime, timeAgo, userCell, toast } from "../lib/ui.js";

let sub = null;

async function render(view) {
  view.innerHTML = `
    <div class="page-title">${icon("clicks")}<span>نقرات رابط احسمها</span></div>
    <div class="stat-grid" id="ck-cards">
      <div class="stat"><div class="sk" style="height:78px"></div></div>
      <div class="stat"><div class="sk" style="height:78px"></div></div>
      <div class="stat"><div class="sk" style="height:78px"></div></div>
    </div>
    <div class="grid-2" style="margin-top:22px">
      <div class="card card-pad"><div class="page-title" style="margin:0 0 12px">${icon("trophy")}<span>الأكثر نقراً</span></div><div id="ck-top" class="list-scroll"></div></div>
      <div class="card card-pad"><div class="page-title" style="margin:0 0 12px">${icon("clock")}<span>أحدث النقرات</span></div><div id="ck-recent" class="list-scroll"></div></div>
    </div>
    <div class="card card-pad" id="ck-help" style="margin-top:22px;display:none"></div>`;

  sub = fb.onSnapshot(fb.collection(fb.db, "ahsemhaLinkClicks"), snap => {
    const clicks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    paint(view, clicks);
  }, err => {
    toast("تعذّر قراءة النقرات: " + err.message, "err", 6000);
    paint(view, []);
  });

  return () => { try { sub && sub(); } catch {} };
}

function paint(view, clicks) {
  const cards = view.querySelector("#ck-cards");
  const total = clicks.length;
  const byUser = {};
  clicks.forEach(c => { const k = c.username || c.usernameLower || "زائر بدون حساب"; byUser[k] = (byUser[k] || 0) + 1; });
  const withAccount = clicks.filter(c => c.username || c.uid).length;
  const uniqueUsers = Object.keys(byUser).length;

  cards.innerHTML = `
    <div class="stat"><div class="stat-top"><div class="stat-label">إجمالي النقرات</div><div class="stat-ico gold">${icon("clicks")}</div></div><div class="stat-value">${fmtNum(total)}</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-label">نقرات من أصحاب حسابات</div><div class="stat-ico">${icon("user")}</div></div><div class="stat-value">${fmtNum(withAccount)}</div></div>
    <div class="stat"><div class="stat-top"><div class="stat-label">حسابات مختلفة نقرت</div><div class="stat-ico green">${icon("users")}</div></div><div class="stat-value">${fmtNum(uniqueUsers)}</div></div>`;

  const top = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 15);
  view.querySelector("#ck-top").innerHTML = top.length
    ? top.map(([name, n], i) => `<div class="mini-row"><span class="rank-num ${i<3?'top'+(i+1):''}">${i+1}</span>${userCell(name, "", "")}<span class="r-val">${fmtNum(n)}</span></div>`).join("")
    : emptyHelp();

  const recent = [...clicks].sort((a, b) => ms(b.clickedAt) - ms(a.clickedAt)).slice(0, 30);
  view.querySelector("#ck-recent").innerHTML = recent.length
    ? recent.map(c => `<div class="mini-row">${userCell(c.username || "زائر بدون حساب", c.target || "", "")}
        <span class="muted" style="margin-inline-start:auto;font-size:12px" title="${fmtDateTime(c.clickedAt)}">${timeAgo(c.clickedAt)}</span></div>`).join("")
    : "";

  const help = view.querySelector("#ck-help");
  if (!total) {
    help.style.display = "block";
    help.innerHTML = `<div class="row" style="gap:9px;color:var(--gold);margin-bottom:8px">${icon("info")}<b>لا توجد نقرات مسجّلة بعد</b></div>
      <p class="dim">هذه الميزة تحتاج تسجيل النقرات من موقع احسمها نفسه. أضف قصاصة التتبّع الجاهزة (ملف <code>tracking-snippet.html</code> في هذا المشروع) عند رابط "احسمها" في الموقع الأساسي، وستظهر النقرات هنا لحظياً.</p>`;
  } else help.style.display = "none";
}

function emptyHelp() { return `<div class="tbl-empty">لا توجد بيانات</div>`; }
function ms(v) { return v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : (v ? new Date(v).getTime() || 0 : 0)); }

export default { id: "clicks", title: "نقرات احسمها", icon: "clicks", render };
