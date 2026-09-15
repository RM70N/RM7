// رسائل المرشد الثابتة (ليست ذكاء اصطناعي حي — لتقليل التكلفة وسرعة الاستجابة) —
// عدة صيغ لكل حالة تُختار عشوائيًا لتفادي الرتابة، بالإضافة لحالات ذكية تعتمد على
// بيانات الطالب الفعلية (سلسلة الإجابات الصح، عدد أيام المذاكرة المتتالية، والوقت الحالي).
const MASCOT_MESSAGES = {
  welcome: [
    'هلا! جاهز تلخّص أول محاضرة؟ 🚀',
    'وش نذاكر اليوم؟ 📖',
    'يا هلا فيك! خلّنا نخلّص محاضرة اليوم بسرعة 💨',
    'رجعت! نكمل من وين وقفنا؟ 🙌',
    'كل يوم خطوة — يلا نبدأ 🌱',
  ],
  uploading: [
    'نرفع الملف... لحظات وبنبدأ نفهمه 📤',
    'صبرك علينا شوي 🙂',
    'الملف بطريقه لنا، ثواني وبنشتغل عليه ⏳',
    'تمام، وصل! نجهزه للمعالجة الحين 📁',
  ],
  processing: [
    'نسمع المحاضرة ونفهمها... هذا يأخذ وقت أقل من حضورها كاملة! 🎧',
    'نبني لك الملخص والخريطة الذهنية الحين ✨',
    'شوي شوي، نستخرج أهم النقاط من كلام الأستاذ 🧩',
    'نرتب لك الأفكار عشان توصلك بأسهل صيغة 🗂️',
  ],
  done: [
    'خلصنا! شوف ملخصك جاهز 🎉',
    'يلا راجع النقاط الصفراء، هذي استنتاجات لازم تتأكد منها ⚠️',
    'تم! جرّب الخريطة الذهنية كمان، بتسهّل عليك المراجعة 🧠',
    'ملخصك جاهز — ابدأ فيه وقت ما تبي 📘',
  ],
  streak: [
    'استمر! سلسلتك ما تنكسر 🔥',
    'يوم ثاني يمر وأنت مذاكر — عاشت 💪',
    'ثبات يعجبني، كمّل على كذا 🙌',
  ],
  quizStart: [
    'جاهز؟ 60 ثانية بس! ⏱️',
    'ركّز، كل ثانية تفرق 🎯',
    'خذ نفس عميق ويلا نبدأ ⚡',
  ],
  quizGood: [
    'قوووي! استمر بنفس المستوى 🔥',
    'ما شاء الله عليك 👏',
    'إجابة صح! كذا نبي 💯',
    'تمام، واضح إنك فاهم الموضوع 🙂',
  ],
  quizBad: [
    'ولا يهمك، راجع الملخص وحاول مرة ثانية 💪',
    'كل غلطة تقرّبك من الفهم الكامل 🙌',
    'عادي، خلّها تجربة تتعلم منها 📖',
    'ما عليك، ركّز بالسؤال الجاي 🎯',
  ],
  // إجابات صح متتالية (٣ فأكثر) بنفس الاختبار — رسالة مختلفة عن إجابة صح عادية.
  quizGoodStreak: [
    'ثلاث صح متتالية! إنت بمود التركيز الحين 🔥🔥',
    'ما تُوقّف! سلسلة إجابات صح رهيبة 🚀',
    'أداء قوي متواصل — استمر على كذا 👏🔥',
  ],
  // مراجعة بعد منتصف الليل — رسالة مختلفة تراعي الوقت المتأخر.
  lateNight: [
    'تذاكر بهالوقت المتأخر؟ ما شاء الله على الجد، بس لا تنسى تنام 🌙',
    'سهرة مذاكرة؟ خذ راحتك واشرب مويه بين كل شوي 🌌',
    'وقت متأخر بس همتك عالية — كمّل وبعدها نام مبكر 😴',
  ],
  // إنجاز سلسلة مذاكرة عند وصولها لأرقام مميزة (٧ / ١٤ / ٣٠ يوم).
  streakMilestone7: ['أسبوع كامل مذاكرة متواصلة! 🔥 سبعة أيام بدون توقف، عاشت!'],
  streakMilestone14: ['أسبوعين متواصلين! 🔥🔥 إنت جاد بموضوع الاستمرارية، فخورين فيك!'],
  streakMilestone30: ['شهر كامل! 🏆 ٣٠ يوم مذاكرة متواصلة — إنجاز يستاهل احتفال حقيقي!'],
};

const LATE_NIGHT_CATEGORIES = new Set(['welcome', 'uploading', 'processing', 'quizStart']);

function isLateNight() {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 5;
}

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

/**
 * يعرض رسالة المرشد. المنطق اللي يحدد أي رسالة يعتمد على بيانات حقيقية عن الطالب
 * (لو تم تمريرها عبر context)، لكن نصوص الرسائل نفسها ثابتة ومكتوبة مسبقًا (بدون أي
 * استدعاء لذكاء اصطناعي حي) للسرعة وتقليل التكلفة.
 * @param {string} category
 * @param {{ correctStreak?: number, streakCount?: number }} [context]
 */
export function sayMascot(category, context = {}) {
  mountMascot();

  let resolvedCategory = category;
  if (context.streakCount === 7 || context.streakCount === 14 || context.streakCount === 30) {
    resolvedCategory = `streakMilestone${context.streakCount}`;
  } else if (category === 'quizGood' && context.correctStreak >= 3) {
    resolvedCategory = 'quizGoodStreak';
  } else if (isLateNight() && LATE_NIGHT_CATEGORIES.has(category)) {
    resolvedCategory = 'lateNight';
  }

  const options = MASCOT_MESSAGES[resolvedCategory] || MASCOT_MESSAGES.welcome;
  const text = options[Math.floor(Math.random() * options.length)];
  const bubble = document.getElementById('mascot-text');
  if (bubble) bubble.textContent = text;
}

// أشكال بطاقات المراجعة — تخصيص بصري مجاني بالكامل (بدون نقاط)، كل شكل له كلاس CSS جاهز.
export const FLASHCARD_STYLES = [
  { id: 'simple', name: 'بسيط ونظيف', className: '', preview: '📄' },
  { id: 'warm', name: 'دافئ متدرج', className: 'fc-style-warm', preview: '🌤️' },
  { id: 'sketch', name: 'رسم يدوي', className: 'fc-style-sketch', preview: '✏️' },
];

export const THEMES = [
  { id: 'default', name: 'الافتراضي', cost: 0, preview: '🤍' },
  { id: 'forest', name: 'غابة هادئة', cost: 100, preview: '🌲' },
  { id: 'sunset', name: 'غروب دافئ', cost: 150, preview: '🌅' },
  { id: 'night', name: 'سهرة مذاكرة', cost: 150, preview: '🌙' },
  { id: 'gold', name: 'إطار ذهبي', cost: 300, preview: '🏆' },
];
