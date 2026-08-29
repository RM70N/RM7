import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LockIcon } from '@/components/Icons';

export function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setBusy(true);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'صار خطأ غير متوقع');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50 dark:bg-ink-950">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <Logo size={56} />
            <div>
              <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">احسمها AI</h1>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                مساحة خاصة — الدخول لصاحب الحساب فقط
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-semibold">
                الباسورد
              </label>
              <input
                id="password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                disabled={busy}
                placeholder="اكتب الباسورد"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
              <LockIcon className="h-4 w-4" />
              {busy ? 'نتحقق…' : 'ادخل'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-400 dark:text-ink-500">
            ما فيه تسجيل حساب جديد — حساب واحد بس.
          </p>
        </div>
      </main>
    </div>
  );
}
