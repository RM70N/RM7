export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ahsmaha-theme';

/**
 * يقرأ التفضيل المحفوظ. الافتراضي ليلي — يطابق الكلاس المكتوب في index.html
 * حتى ما يصير وميض عند أول تحميل. المستخدم يبدّل متى ما بغى ويُحفظ اختياره.
 */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // التخزين المحلي ممنوع أحيانًا — نكمل بالافتراضي
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // نتجاهل — التبديل يشتغل للجلسة الحالية على الأقل
  }
}
