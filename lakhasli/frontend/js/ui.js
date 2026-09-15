export function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function watchOfflineState() {
  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.textContent = 'ما فيه اتصال بالإنترنت حاليًا — بعض الميزات قد ما تشتغل.';
  banner.hidden = navigator.onLine;
  document.body.prepend(banner);

  window.addEventListener('online', () => {
    banner.hidden = true;
  });
  window.addEventListener('offline', () => {
    banner.hidden = false;
  });
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/**
 * يقرأ نصًا عربيًا صوتيًا عبر Web Speech API المدمجة بالمتصفح، مع كشف الفشل الصامت —
 * بعض أجهزة أندرويد ما فيها صوت عربي مثبّت، وبهالحالة speak() ما يطلق أي حدث خطأ
 * ولا يصدر صوت، فيبدو للطالب إن الزر "توقف بدون سبب". نستخدم مؤقّت قصير: لو ما
 * بدأت القراءة فعليًا خلال ثانية ونص، نعتبرها فشلت ونعرض رسالة واضحة قابلة للتصرف.
 * @param {string} text
 * @param {{ lang?: string, onStart?: () => void, onEnd?: () => void, onError?: (message: string) => void }} [opts]
 */
// تحميل قائمة الأصوات مبكرًا (بعض إصدارات كروم ما تُطلق صوت أول استدعاء لـspeak()
// إلا بعد أول استدعاء لـgetVoices()، اللي قد يكون غير متزامن).
if ('speechSynthesis' in window) speechSynthesis.getVoices();

export function speakText(text, opts = {}) {
  const { lang = 'ar-SA', onStart, onEnd, onError } = opts;

  if (!text?.trim()) return;
  if (!('speechSynthesis' in window)) {
    onError?.('القراءة الصوتية غير مدعومة بهذا المتصفح.');
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  let started = false;
  utterance.onstart = () => {
    started = true;
    onStart?.();
  };
  utterance.onend = () => onEnd?.();
  utterance.onerror = (e) => {
    onError?.(`تعذّرت القراءة الصوتية (${e.error || 'خطأ غير معروف'}).`);
  };

  speechSynthesis.speak(utterance);

  setTimeout(() => {
    if (!started && !speechSynthesis.speaking) {
      speechSynthesis.cancel();
      onError?.(
        'ما قدرنا نشغّل القراءة الصوتية على جهازك. جرّب تثبيت صوت عربي من إعدادات أندرويد ← تسهيلات الاستخدام ← تحويل النص إلى كلام.'
      );
    }
  }, 1500);
}
