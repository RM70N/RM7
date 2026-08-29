import { useState, type FormEvent } from 'react';
import { ApiError, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SettingsPage() {
  const { owner, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (newPassword !== confirmPassword) {
      setStatus({ kind: 'error', text: 'الباسورد الجديد وتأكيده ما يتطابقون' });
      return;
    }
    if (newPassword.length < 12) {
      setStatus({ kind: 'error', text: 'الباسورد الجديد لازم 12 حرف على الأقل' });
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setStatus({ kind: 'ok', text: 'تغيّر الباسورد. بنخرجك عشان تدخل من جديد.' });
      setTimeout(() => void logout(), 1500);
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof ApiError ? error.message : 'صار خطأ غير متوقع',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up space-y-6 px-4 py-10 sm:px-6 lg:py-14">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">الإعدادات</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          حسابك ومفاتيح الحماية — كل شي محفوظ مشفّر.
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">الحساب</h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-500 dark:text-ink-400">الاسم</dt>
            <dd className="mt-1 font-semibold">{owner?.displayName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-500 dark:text-ink-400">آخر دخول</dt>
            <dd className="mt-1 font-semibold">{formatDate(owner?.lastLoginAt ?? null)}</dd>
          </div>
          <div>
            <dt className="text-ink-500 dark:text-ink-400">تاريخ الإنشاء</dt>
            <dd className="mt-1 font-semibold">{formatDate(owner?.createdAt ?? null)}</dd>
          </div>
        </dl>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">تغيير الباسورد</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            بعد التغيير بتنتهي كل الجلسات على كل الأجهزة.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="current" className="block text-sm font-semibold">
              الباسورد الحالي
            </label>
            <input
              id="current"
              type="password"
              className="field"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="new" className="block text-sm font-semibold">
              الباسورد الجديد
            </label>
            <input
              id="new"
              type="password"
              className="field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm" className="block text-sm font-semibold">
              تأكيد الباسورد الجديد
            </label>
            <input
              id="confirm"
              type="password"
              className="field"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              disabled={busy}
            />
          </div>

          {status ? (
            <p
              role="alert"
              className={[
                'rounded-xl px-4 py-3 text-sm font-medium',
                status.kind === 'ok'
                  ? 'bg-brand-600/10 text-brand-700 dark:text-brand-300'
                  : 'bg-red-500/10 text-red-700 dark:text-red-300',
              ].join(' ')}
            >
              {status.text}
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'نحدّث…' : 'غيّر الباسورد'}
          </button>
        </form>
      </section>
    </div>
  );
}
