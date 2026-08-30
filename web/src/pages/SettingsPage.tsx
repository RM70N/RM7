import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, authApi, keysApi, type ApiKeyItem } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

  // مفاتيح API
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<ApiKeyItem | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await keysApi.list();
      setKeys(data.keys);
      setScopes(data.scopes);
      setLabels(data.labels);
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل المفاتيح');
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleIssueKey(event: FormEvent) {
    event.preventDefault();
    if (issuing || !keyName.trim() || keyScopes.length === 0) return;

    setIssuing(true);
    setKeyError(null);
    try {
      const result = await keysApi.issue(keyName.trim(), keyScopes);
      setNewSecret(result.secret);
      setKeyName('');
      setKeyScopes([]);
      await loadKeys();
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'ما قدرنا نصدر المفتاح');
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevokeKey(key: ApiKeyItem) {
    setConfirmKey(null);
    try {
      await keysApi.revoke(key.id);
      await loadKeys();
    } catch (err) {
      setKeyError(err instanceof ApiError ? err.message : 'ما قدرنا نلغي المفتاح');
    }
  }

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
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">مفاتيح API احسمها</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            صدّر مفاتيح لتطبيقاتك الخارجية. المفتاح يظهر مرة وحدة بس —
            احفظه وقتها.
          </p>
        </div>

        {newSecret ? (
          <div className="space-y-2 rounded-xl bg-brand-600/10 p-4">
            <p className="text-sm font-bold text-brand-800 dark:text-brand-200">
              مفتاحك الجديد — انسخه الحين، ما بيظهر مرة ثانية
            </p>
            <code
              className="block overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-brand-300"
              dir="ltr"
            >
              {newSecret}
            </code>
            <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setNewSecret(null)}>
              حفظته — اخفِه
            </button>
          </div>
        ) : null}

        <form onSubmit={handleIssueKey} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="key-name" className="block text-sm font-semibold">
              اسم المفتاح
            </label>
            <input
              id="key-name"
              className="field"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="مثال: تطبيق الجوال"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">الصلاحيات</legend>
            <div className="flex flex-wrap gap-2">
              {scopes.map((scope) => (
                <label
                  key={scope}
                  className={[
                    'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    keyScopes.includes(scope)
                      ? 'border-brand-500 bg-brand-600/10 text-brand-700 dark:text-brand-300'
                      : 'border-ink-200 text-ink-600 dark:border-ink-800 dark:text-ink-400',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={keyScopes.includes(scope)}
                    onChange={() =>
                      setKeyScopes((prev) =>
                        prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
                      )
                    }
                  />
                  {labels[scope] ?? scope}
                </label>
              ))}
            </div>
          </fieldset>

          {keyError ? (
            <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
              {keyError}
            </p>
          ) : null}

          <button
            type="submit"
            className="btn-primary"
            disabled={issuing || !keyName.trim() || keyScopes.length === 0}
          >
            {issuing ? 'نصدر…' : 'صدّر مفتاح'}
          </button>
        </form>

        {keys.length > 0 ? (
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {keys.map((key) => (
              <li key={key.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {key.name}
                    {key.revokedAt ? (
                      <span className="ms-2 rounded-full bg-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                        ملغي
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-ink-400 dark:text-ink-500" dir="ltr">
                    {key.prefix}.••••••••
                  </p>
                  <p className="mt-1 text-[11px] text-ink-400 dark:text-ink-500">
                    {key.scopes.map((s) => labels[s] ?? s).join(' · ')}
                    {key.lastUsedAt ? ` · آخر استخدام ${formatDate(key.lastUsedAt)}` : ' · ما استُخدم'}
                  </p>
                </div>
                {!key.revokedAt ? (
                  <button
                    type="button"
                    className="btn-ghost shrink-0 !px-2 !py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    onClick={() => setConfirmKey(key)}
                  >
                    ألغِ
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-ink-400 dark:text-ink-500">
          التوثيق: <code dir="ltr">GET /api/v1/docs</code>
        </p>
      </section>

      <ConfirmDialog
        open={confirmKey !== null}
        title="تلغي المفتاح؟"
        message={`أي تطبيق يستخدم "${confirmKey?.name ?? ''}" بيتوقف فورًا.`}
        confirmLabel="ألغِ"
        onConfirm={() => confirmKey && void handleRevokeKey(confirmKey)}
        onCancel={() => setConfirmKey(null)}
      />
    </div>
  );
}
