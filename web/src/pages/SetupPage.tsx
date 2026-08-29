import { useState, type FormEvent } from 'react';
import { ApiError, api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * الإعداد الأول — تظهر مرة وحدة بس على سيرفر جديد،
 * وتختفي نهائيًا بعد ما تحدد باسوردك.
 */
export function SetupPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 12 && password === confirm;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid) return;

    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/setup', { password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'صار خطأ غير متوقع');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50 dark:bg-ink-950">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <Logo size={56} />
            <div>
              <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">
                هلا والله — أول مرة
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                حدد باسورد الدخول حقك. هذي الصفحة تظهر مرة وحدة بس، وبعدها
                تختفي نهائيًا.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="block text-sm font-semibold">
                الباسورد
              </label>
              <input
                id="new-password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                placeholder="12 حرف على الأقل"
              />
              {tooShort ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ناقص {12 - password.length} حرف
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="block text-sm font-semibold">
                أكّد الباسورد
              </label>
              <input
                id="confirm-password"
                type="password"
                className="field"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                placeholder="اكتبه مرة ثانية"
              />
              {mismatch ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  الباسوردان ما يتطابقون
                </p>
              ) : null}
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy || !valid}>
              {busy ? 'نجهّز…' : 'ابدأ'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-400 dark:text-ink-500">
            احفظ الباسورد في مكان آمن — ما فيه استرجاع بالإيميل،
            لأن النظام ما يعرف إيميلك أصلًا.
          </p>
        </div>
      </main>
    </div>
  );
}
