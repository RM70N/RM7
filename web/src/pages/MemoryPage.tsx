import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  memoryApi,
  type MemoryCategory,
  type MemoryDraft,
  type MemoryItem,
  type MemoryStats,
} from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const CATEGORIES: { value: MemoryCategory; label: string }[] = [
  { value: 'personal', label: 'شخصي' },
  { value: 'preference', label: 'تفضيل' },
  { value: 'project', label: 'مشروع' },
  { value: 'fact', label: 'معلومة' },
  { value: 'instruction', label: 'تعليمات' },
];

const EMPTY_DRAFT: MemoryDraft = {
  title: '',
  content: '',
  category: 'fact',
  importance: 3,
  pinned: false,
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium' }).format(new Date(value));
}

export function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<MemoryCategory | ''>('');

  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState<MemoryDraft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<MemoryItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await memoryApi.list({
        ...(category ? { category } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      setMemories(data.memories);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل الذاكرة');
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  function openNew() {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  }

  function openEdit(memory: MemoryItem) {
    setEditing(memory);
    setDraft({
      title: memory.title,
      content: memory.content,
      category: memory.category,
      importance: memory.importance,
      pinned: memory.pinned,
    });
    setFormOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await memoryApi.update(editing.id, draft);
      } else {
        await memoryApi.create(draft);
      }
      setFormOpen(false);
      setEditing(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحفظ');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(memory: MemoryItem) {
    setConfirmDelete(null);
    try {
      await memoryApi.remove(memory.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحذف');
    }
  }

  async function handleTogglePin(memory: MemoryItem) {
    try {
      await memoryApi.update(memory.id, { pinned: !memory.pinned });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحدّث');
    }
  }

  async function handleClearAuto() {
    setConfirmClear(false);
    try {
      await memoryApi.clear('auto');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نمسح');
    }
  }

  if (loading) return <Spinner label="نحمّل الذاكرة…" />;

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">الذاكرة الدائمة</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            كل شي هنا احسمها يتذكره في كل محادثة — ما يضيع أبدًا.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openNew}>
          أضف ذكرى
        </button>
      </header>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'الكل', value: stats.total },
            { label: 'مثبّتة', value: stats.pinned },
            { label: 'تلقائية', value: stats.auto },
            { label: 'يدوية', value: stats.manual },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <div className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">
                {card.value}
              </div>
              <div className="text-xs text-ink-500 dark:text-ink-400">{card.label}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          className="field flex-1 !py-2 sm:max-w-xs"
          placeholder="دوّر في الذاكرة…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="field !w-auto !py-2"
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory | '')}
          aria-label="تصفية حسب التصنيف"
        >
          <option value="">كل التصنيفات</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {stats && stats.auto > 0 ? (
          <button type="button" className="btn-ghost !py-2" onClick={() => setConfirmClear(true)}>
            امسح التلقائية
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {memories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 px-6 py-14 text-center dark:border-ink-700">
          <p className="font-semibold text-ink-700 dark:text-ink-300">
            {search || category ? 'ما فيه نتائج' : 'الذاكرة فاضية'}
          </p>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            {search || category
              ? 'جرّب كلمة ثانية أو شيل التصفية.'
              : 'احسمها بيحفظ معلوماتك تلقائيًا وأنت تسولف معه، أو أضف وحدة يدويًا.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {memories.map((memory) => (
            <li key={memory.id} className="card !p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink-900 dark:text-ink-100">{memory.title}</h3>
                    {memory.pinned ? (
                      <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        مثبّتة
                      </span>
                    ) : null}
                    <span className="rounded-full bg-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-400">
                      {CATEGORIES.find((c) => c.value === memory.category)?.label}
                    </span>
                    {memory.source === 'auto' ? (
                      <span className="text-[11px] text-ink-400 dark:text-ink-500">تلقائية</span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-600 dark:text-ink-400">
                    {memory.content}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-400 dark:text-ink-500">
                    <span>الأهمية {memory.importance}/5</span>
                    <span>{formatDate(memory.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 text-xs"
                    onClick={() => void handleTogglePin(memory)}
                    title={memory.pinned ? 'إلغاء التثبيت' : 'ثبّت'}
                  >
                    {memory.pinned ? 'فكّ' : 'ثبّت'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 text-xs"
                    onClick={() => openEdit(memory)}
                  >
                    عدّل
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                    onClick={() => setConfirmDelete(memory)}
                  >
                    احذف
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* نموذج الإضافة/التعديل */}
      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <form onSubmit={handleSave} className="card max-h-[90dvh] w-full max-w-lg animate-fade-up overflow-y-auto">
            <h2 className="text-lg font-bold">{editing ? 'عدّل الذكرى' : 'ذكرى جديدة'}</h2>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="mem-title" className="block text-sm font-semibold">
                  العنوان
                </label>
                <input
                  id="mem-title"
                  className="field"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="مثال: لغتي المفضلة"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="mem-content" className="block text-sm font-semibold">
                  المحتوى
                </label>
                <textarea
                  id="mem-content"
                  className="field min-h-[110px] resize-y"
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder="مثال: أفضّل تايب سكربت على جافاسكربت في كل المشاريع"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="mem-cat" className="block text-sm font-semibold">
                    التصنيف
                  </label>
                  <select
                    id="mem-cat"
                    className="field"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value as MemoryCategory })
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="mem-imp" className="block text-sm font-semibold">
                    الأهمية: {draft.importance}
                  </label>
                  <input
                    id="mem-imp"
                    type="range"
                    min={1}
                    max={5}
                    value={draft.importance}
                    onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                    className="w-full accent-brand-600"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                  className="h-4 w-4 accent-brand-600"
                />
                ثبّتها — تنحقن في كل محادثة مهما كان الموضوع
              </label>
            </div>

            <div className="mt-6 flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'نحفظ…' : 'احفظ'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)}>
                الغِ
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="تحذف الذكرى؟"
        message={`بتنحذف "${confirmDelete?.title ?? ''}" نهائيًا، واحسمها ما بيتذكرها بعدها.`}
        confirmLabel="احذف"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="تمسح الذكريات التلقائية؟"
        message="بتنمسح كل الذكريات اللي حفظها احسمها تلقائيًا. المثبّتة واليدوية تبقى."
        confirmLabel="امسح"
        onConfirm={() => void handleClearAuto()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
