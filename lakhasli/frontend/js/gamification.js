// رسائل المرشد الثابتة (ليست ذكاء اصطناعي حي — لتقليل التكلفة) حسب مرحلة التقدم.
const MASCOT_MESSAGES = {
  welcome: ['هلا! جاهز تلخّص أول محاضرة؟ 🚀', 'وش نذاكر اليوم؟ 📖'],
  uploading: ['نرفع الملف... لحظات وبنبدأ نفهمه 📤', 'صبرك علينا شوي 🙂'],
  processing: ['نسمع المحاضرة ونفهمها... هذا يأخذ وقت أقل من حضورها كاملة! 🎧', 'نبني لك الملخص والخريطة الذهنية الحين ✨'],
  done: ['خلصنا! شوف ملخصك جاهز 🎉', 'يلا راجع النقاط الصفراء، هذي استنتاجات لازم تتأكد منها ⚠️'],
  streak: ['استمر! سلسلتك ما تنكسر 🔥', 'يوم ثاني يمر وأنت مذاكر — عاشت 💪'],
  quizStart: ['جاهز؟ 60 ثانية بس! ⏱️', 'ركّز، كل ثانية تفرق 🎯'],
  quizGood: ['قوووي! استمر بنفس المستوى 🔥', 'ما شاء الله عليك 👏'],
  quizBad: ['ولا يهمك، راجع الملخص وحاول مرة ثانية 💪', 'كل غلطة تقرّبك من الفهم الكامل 🙌'],
};

let mascotEl = null;

export function mountMascot() {
  if (mascotEl) return;
  mascotEl = document.createElement('div');
  mascotEl.className = 'mascot';
  mascotEl.innerHTML = `
    <div class="mascot-avatar">🦉</div>
    <div class="mascot-bubble" id="mascot-text"></div>
  `;
  document.body.appendChild(mascotEl);
}

export function sayMascot(category) {
  mountMascot();
  const options = MASCOT_MESSAGES[category] || MASCOT_MESSAGES.welcome;
  const text = options[Math.floor(Math.random() * options.length)];
  const bubble = document.getElementById('mascot-text');
  if (bubble) bubble.textContent = text;
}

export const THEMES = [
  { id: 'default', name: 'الافتراضي', cost: 0, preview: '🤍' },
  { id: 'forest', name: 'غابة هادئة', cost: 100, preview: '🌲' },
  { id: 'sunset', name: 'غروب دافئ', cost: 150, preview: '🌅' },
  { id: 'night', name: 'سهرة مذاكرة', cost: 150, preview: '🌙' },
  { id: 'gold', name: 'إطار ذهبي', cost: 300, preview: '🏆' },
];
