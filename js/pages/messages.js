/* ==========================================================================
   الرسائل والدعم — صندوق وارد من feedback (اقتراحات/مشاكل يرسلها المستخدمون).
   feedback/{id} = { type:'suggestion'|'problem', text, username, uid, createdAt }
   اللوحة تضيف: { status:'new'|'replied'|'archived', reply, repliedAt, repliedBy }.
   الرد يصل للمستخدم عبر قناة personalMessages/{usernameLower} الفعلية.
   ========================================================================== */
import { fb, OWNER } from "../firebase.js";
import { icon, esc, toast, modal, $, $$, fmtDateTime, userCell } from "../lib/ui.js";
import { logAudit, session } from "../auth.js";
import { setNavBadge } from "../main.js";

let sub = null, rows = [], curTab = "new";

async function render(view) {
  view.innerHTML = `
    <div class="toolbar">
      <div class="chips" id="mg-tabs">
        <button class="chip active" data-t="new">جديد</button>
        <button class="chip" data-t="replied">تم الرد</button>
        <button class="chip" data-t="archived">مؤرشف</button>
        <button class="chip" data-t="all">الكل</button>
      </div>
    </div>
    <div id="mg-list" class="list-scroll" style="max-height:none;gap:12px"><div class="tbl-empty">${icon("refresh","spin")} جارِ التحميل...</div></div>`;

  $$("#mg-tabs .chip", view).forEach(c => c.onclick = () => {
    $$("#mg-tabs .chip", view).forEach(x => x.classList.remove("active"));
    c.classList.add("active"); curTab = c.dataset.t; paint();
  });

  sub = fb.onSnapshot(fb.collection(fb.db, "feedback"), snap => {
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    const unread = rows.filter(r => (r.status || "new") === "new").length;
    setNavBadge("messages", unread);
    paint();
  }, err => { const l = $("#mg-list", view); if (l) l.innerHTML = `<div class="tbl-empty" style="color:var(--danger)">تعذّر الجلب: ${esc(err.message)}</div>`; });

  return () => { try { sub && sub(); } catch {} };
}

function paint() {
  const list = $("#mg-list"); if (!list) return;
  let items = rows;
  if (curTab !== "all") items = rows.filter(r => (r.status || "new") === curTab);
  if (!items.length) { list.innerHTML = `<div class="tbl-empty">لا توجد رسائل في هذا التصنيف</div>`; return; }
  list.innerHTML = items.map(cardHtml).join("");
  list.querySelectorAll("[data-id]").forEach(card => {
    const r = rows.find(x => x.id === card.dataset.id);
    card.querySelector('[data-a="reply"]')?.addEventListener("click", () => reply(r));
    card.querySelector('[data-a="archive"]')?.addEventListener("click", () => setStatus(r, "archived"));
    card.querySelector('[data-a="unarchive"]')?.addEventListener("click", () => setStatus(r, "new"));
  });
}

function cardHtml(r) {
  const status = r.status || "new";
  const typeBadge = r.type === "suggestion"
    ? `<span class="badge badge-purple">اقتراح</span>` : `<span class="badge badge-gold">مشكلة</span>`;
  const stBadge = { new: `<span class="badge badge-online">جديد</span>`, replied: `<span class="badge badge-gold">تم الرد</span>`, archived: `<span class="badge badge-offline">مؤرشف</span>` }[status];
  return `<div class="card card-pad" data-id="${esc(r.id)}">
    <div class="row between wrap" style="margin-bottom:10px">
      <div class="row" style="gap:10px">${userCell(r.username || "مجهول", "", "")}${typeBadge}</div>
      <div class="row" style="gap:8px">${stBadge}<span class="muted" style="font-size:12px">${fmtDateTime(r.createdAt)}</span></div>
    </div>
    <div style="white-space:pre-wrap;line-height:1.7">${esc(r.text || "")}</div>
    ${r.reply ? `<div class="mini-row" style="margin-top:12px;flex-direction:column;align-items:stretch;gap:4px">
      <div class="row" style="gap:7px;color:var(--gold)">${icon("send","icon-sm")}<b>ردّك</b></div>
      <div style="white-space:pre-wrap">${esc(r.reply)}</div></div>` : ""}
    <div class="row mt" style="gap:8px">
      <button class="btn btn-purple btn-sm" data-a="reply">${icon("send","icon-sm")}<span>${r.reply ? "رد آخر" : "رد"}</span></button>
      ${status === "archived"
        ? `<button class="btn btn-ghost btn-sm" data-a="unarchive">إلغاء الأرشفة</button>`
        : `<button class="btn btn-ghost btn-sm" data-a="archive">أرشفة</button>`}
    </div></div>`;
}

function reply(r) {
  modal({
    title: `الرد على ${r.username || "المستخدم"}`,
    body: `<div class="mini-row" style="margin-bottom:12px">${esc(r.text || "")}</div>
      <div class="field"><label>نص الرد (يصل للمستخدم داخل احسمها)</label><textarea id="rp-text" class="textarea"></textarea></div>`,
    actions: [
      { label: "إلغاء", cls: "btn-ghost" },
      { label: "إرسال الرد", cls: "btn-purple", icon: "send", onClick: async (close, b) => {
        const text = $("#rp-text").value.trim(); if (!text) return toast("اكتب نص الرد", "err");
        b.disabled = true;
        try {
          await fb.setDoc(fb.doc(fb.db, "feedback", r.id), {
            reply: text, status: "replied", repliedAt: fb.serverTimestamp(), repliedBy: session.user?.email || OWNER.email
          }, { merge: true });
          // إيصال الرد للمستخدم عبر قناة الرسائل الفعلية
          const lower = (r.username || "").toLowerCase().replace(/^@/, "");
          if (lower) await fb.setDoc(fb.doc(fb.db, "personalMessages", lower), {
            text: "رد الإدارة: " + text, sentAt: fb.serverTimestamp(), position: "top", durationMode: "timed", sentBy: session.user?.email || OWNER.email
          }).catch(() => {});
          await logAudit("feedback_reply", { target: r.username, detail: text.slice(0, 120) });
          toast("تم إرسال الرد", "ok"); close();
        } catch (e) { toast("تعذّر الإرسال: " + e.message, "err"); b.disabled = false; }
      } }
    ]
  });
}

async function setStatus(r, status) {
  try {
    await fb.setDoc(fb.doc(fb.db, "feedback", r.id), { status }, { merge: true });
    await logAudit("feedback_status", { target: r.username, detail: status });
  } catch (e) { toast("تعذّر التحديث: " + e.message, "err"); }
}

function ms(v) { return v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : 0); }

export default { id: "messages", title: "الرسائل والدعم", icon: "messages", render };
