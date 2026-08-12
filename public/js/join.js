/* ===== صفحة الانضمام الخفيفة (مسار الباركود) ===== */
const AVATARS = ['🎨', '🖌️', '🐫', '🦅', '🧑‍🎨', '👑', '🐱', '🌴', '☕', '🚀', '👽', '🦖', '🍔', '🎭', '⚡'];
const $ = (s) => document.querySelector(s);
let chosenAvatar = AVATARS[0];

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'toast err'; setTimeout(() => t.classList.add('hidden'), 2500); }

function showError(text) {
  $('#join-status').classList.add('hidden');
  $('#join-form').classList.add('hidden');
  $('#join-error').classList.remove('hidden');
  $('#join-error-text').textContent = text;
}

async function init() {
  const code = new URLSearchParams(location.search).get('room');
  if (!code) return showError('رابط غير صالح — لا يوجد رمز غرفة');

  // بناء منتقي الأفاتار
  const grid = $('#j-avatars');
  AVATARS.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'av' + (i === 0 ? ' sel' : '');
    el.textContent = a;
    el.onclick = () => { document.querySelectorAll('#j-avatars .av').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); chosenAvatar = a; };
    grid.appendChild(el);
  });

  // التحقق من حالة الغرفة
  try {
    const r = await fetch('/api/room/' + encodeURIComponent(code));
    const info = await r.json();
    if (!info.exists) return showError('هذه الغرفة لم تعد متاحة');
    if (info.locked) return showError('الغرفة مقفلة — لا يمكن الانضمام');
    if (info.full) return showError('الغرفة مكتملة العدد');
    if (info.state === 'playing' && !info.allowLateJoin) return showError('اللعبة قيد التشغيل — انتظر الجولة القادمة');

    $('#join-status').textContent = info.hostName
      ? `انضممت إلى غرفة ${info.hostName} — (${info.playerCount}/${info.maxPlayers})`
      : `غرفة ${code}`;
    $('#join-form').classList.remove('hidden');

    const saved = localStorage.getItem('gh_name');
    if (saved) $('#j-name').value = saved;
  } catch {
    return showError('تعذّر الاتصال بالخادم');
  }

  $('#j-btn').onclick = () => {
    const name = $('#j-name').value.trim();
    if (!name) { toast('اكتب اسمك أولًا'); $('#j-name').focus(); return; }
    localStorage.setItem('gh_name', name);
    localStorage.setItem('gh_avatar', chosenAvatar);
    // ننتقل للتطبيق الرئيسي مع الانضمام التلقائي
    location.href = `/index.html?room=${encodeURIComponent(code)}&auto=1`;
  };
}

window.addEventListener('DOMContentLoaded', init);
