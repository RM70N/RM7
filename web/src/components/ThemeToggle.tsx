import { useEffect, useState } from 'react';
import { applyTheme, readTheme, type Theme } from '@/lib/theme';
import { MoonIcon, SunIcon } from './Icons';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="btn-ghost !px-2.5"
      title={next === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}
      aria-label={next === 'dark' ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع النهاري'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
