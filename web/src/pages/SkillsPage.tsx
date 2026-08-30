import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import {
  ApiError,
  knowledgeApi,
  type DocumentItem,
  type EmbeddingInfo,
  type KnowledgeStats,
  type SkillDraft,
  type SkillItem,
} from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const EMPTY_SKILL: SkillDraft = {
  title: '',
  description: '',
  content: '',
  tags: [],
  enabled: true,
  alwaysOn: false,
};

const STATUS_LABELS: Record<DocumentItem['status'], string> = {
  pending: 'بالانتظار',
  processing: 'نقرأه…',
  ready: 'جاهز',
  failed: 'فشل',
};

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} ميغا`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} كيلو`;
  return `${bytes} بايت`;
}

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tab, setTab] = useState<'skills' | 'files'>('skills');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SkillItem | null>(null);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_SKILL);
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmSkill, setConfirmSkill] = useState<SkillItem | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<DocumentItem | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await knowledgeApi.overview();
      setSkills(data.skills);
      setDocuments(data.documents);
      setStats(data.stats);
      setEmbedding(data.embedding);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل المعرفة');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // نتابع الملفات اللي لسا تُقرأ حتى تخلص
  useEffect(() => {
    const pending = documents.some((d) => d.status === 'pending' || d.status === 'processing');
    if (!pending) return undefined;

    const timer = setTimeout(() => void load(), 2500);
    return () => clearTimeout(timer);
  }, [documents, load]);

  function openNewSkill() {
    setEditing(null);
    setDraft(EMPTY_SKILL);
    setTagsText('');
    setFormOpen(true);
  }

  function openEditSkill(skill: SkillItem) {
    setEditing(skill);
    setDraft({
      title: skill.title,
      description: skill.description,
      content: skill.content,
      tags: skill.tags,
      enabled: skill.enabled,
      alwaysOn: skill.alwaysOn,
    });
    setTagsText(skill.tags.join('، '));
    setFormOpen(true);
  }

  async function handleSaveSkill(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      const tags = tagsText
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (editing) {
        await knowledgeApi.updateSkill(editing.id, { ...draft, tags });
      } else {
        await knowledgeApi.createSkill({ ...draft, tags });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحفظ المهارة');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || uploading) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeApi.upload(list);
      setNotice(`رفعنا ${result.documents.length} ملف — نقرأها الحين…`);
      setTab('files');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نرفع الملفات');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) void handleUpload(event.dataTransfer.files);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void handleUpload(event.target.files);
  }

  async function handleToggleSkill(skill: SkillItem, field: 'enabled' | 'alwaysOn') {
    try {
      await knowledgeApi.updateSkill(skill.id, { [field]: !skill[field] });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحدّث');
    }
  }

  async function handleDeleteSkill(skill: SkillItem) {
    setConfirmSkill(null);
    try {
      await knowledgeApi.removeSkill(skill.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحذف');
    }
  }

  async function handleDeleteDoc(doc: DocumentItem) {
    setConfirmDoc(null);
    try {
      await knowledgeApi.removeDocument(doc.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحذف');
    }
  }

  if (loading) return <Spinner label="نحمّل المعرفة…" />;

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">
          المهارات وقاعدة المعرفة
        </h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          علّم احسمها طرق شغلك، وارفع ملفاتك — يرجع لها وقت الحاجة.
        </p>
      </header>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'مهارات', value: `${stats.activeSkills}/${stats.skills}` },
            { label: 'ملفات', value: `${stats.readyDocuments}/${stats.documents}` },
            { label: 'مقاطع مفهرسة', value: stats.chunks },
            { label: 'بمتجهات', value: stats.embedded },
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

      {embedding && !embedding.available ? (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          البحث الدلالي معطّل — نعتمد على الكلمات المفتاحية.
          {embedding.reason ? ` ${embedding.reason}` : ''}
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {(
          [
            ['skills', `المهارات (${skills.length})`],
            ['files', `الملفات (${documents.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={[
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === value
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl bg-brand-600/10 px-4 py-3 text-sm font-medium text-brand-700 dark:text-brand-300">
          {notice}
        </p>
      ) : null}

      {tab === 'skills' ? (
        <section className="space-y-4">
          <button type="button" className="btn-primary" onClick={openNewSkill}>
            أضف مهارة
          </button>

          {skills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-300 px-6 py-14 text-center dark:border-ink-700">
              <p className="font-semibold text-ink-700 dark:text-ink-300">ما فيه مهارات بعد</p>
              <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                اكتب تعليمات أو طريقة شغل، واحسمها يمشي عليها.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {skills.map((skill) => (
                <li key={skill.id} className="card !p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-ink-900 dark:text-ink-100">{skill.title}</h3>
                        {skill.alwaysOn ? (
                          <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            دائمة
                          </span>
                        ) : null}
                        {!skill.enabled ? (
                          <span className="rounded-full bg-ink-200/70 px-2 py-0.5 text-[11px] font-medium text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                            معطّلة
                          </span>
                        ) : null}
                      </div>
                      {skill.description ? (
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                          {skill.description}
                        </p>
                      ) : null}
                      <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-600 dark:text-ink-400">
                        {skill.content}
                      </p>
                      {skill.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {skill.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-ink-200/60 px-1.5 py-0.5 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1.5 text-xs"
                        onClick={() => void handleToggleSkill(skill, 'alwaysOn')}
                      >
                        {skill.alwaysOn ? 'خلها عند الحاجة' : 'خلها دائمة'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1.5 text-xs"
                        onClick={() => void handleToggleSkill(skill, 'enabled')}
                      >
                        {skill.enabled ? 'عطّل' : 'فعّل'}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1.5 text-xs"
                        onClick={() => openEditSkill(skill)}
                      >
                        عدّل
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                        onClick={() => setConfirmSkill(skill)}
                      >
                        احذف
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={[
              'rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragOver
                ? 'border-brand-500 bg-brand-600/5'
                : 'border-ink-300 dark:border-ink-700',
            ].join(' ')}
          >
            <p className="font-semibold text-ink-700 dark:text-ink-300">
              {uploading ? 'نرفع الملفات…' : 'اسحب ملفاتك هنا'}
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              PDF · Word · Excel · CSV · نص · صور (يقرأ النص منها)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp"
              aria-label="اختر ملفات"
            />
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              اختر ملفات
            </button>
          </div>

          {documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500 dark:text-ink-400">
              ما رفعت أي ملف بعد.
            </p>
          ) : (
            <ul className="space-y-3">
              {documents.map((doc) => (
                <li key={doc.id} className="card !p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold text-ink-900 dark:text-ink-100">
                          {doc.filename}
                        </h3>
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-[11px] font-bold',
                            doc.status === 'ready'
                              ? 'bg-brand-600/10 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                              : doc.status === 'failed'
                                ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                          ].join(' ')}
                        >
                          {STATUS_LABELS[doc.status]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-400 dark:text-ink-500">
                        <span>{humanSize(doc.size)}</span>
                        {doc.pageCount ? <span>{doc.pageCount} صفحة</span> : null}
                        {doc.chunkCount > 0 ? <span>{doc.chunkCount} مقطع</span> : null}
                        {doc.textLength > 0 ? <span>{doc.textLength} حرف</span> : null}
                      </div>
                      {doc.error ? (
                        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{doc.error}</p>
                      ) : null}
                      {doc.preview ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink-600 dark:text-ink-400">
                          {doc.preview}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <a
                        href={knowledgeApi.downloadUrl(doc.id)}
                        className="btn-ghost !px-2 !py-1.5 text-xs"
                        download
                      >
                        حمّل
                      </a>
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1.5 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                        onClick={() => setConfirmDoc(doc)}
                      >
                        احذف
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* نموذج المهارة */}
      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <form
            onSubmit={handleSaveSkill}
            className="card max-h-[90dvh] w-full max-w-lg animate-fade-up overflow-y-auto"
          >
            <h2 className="text-lg font-bold">{editing ? 'عدّل المهارة' : 'مهارة جديدة'}</h2>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="sk-title" className="block text-sm font-semibold">
                  اسم المهارة
                </label>
                <input
                  id="sk-title"
                  className="field"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="مثال: أسلوب كتابة الكود"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="sk-desc" className="block text-sm font-semibold">
                  وصف مختصر (اختياري)
                </label>
                <input
                  id="sk-desc"
                  className="field"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="متى يستخدمها احسمها"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="sk-content" className="block text-sm font-semibold">
                  التعليمات
                </label>
                <textarea
                  id="sk-content"
                  className="field min-h-[160px] resize-y"
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder="اكتب طريقة شغلك أو التعليمات اللي تبيه يمشي عليها"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="sk-tags" className="block text-sm font-semibold">
                  وسوم (اختياري)
                </label>
                <input
                  id="sk-tags"
                  className="field"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="برمجة، تصميم، كتابة"
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.alwaysOn}
                  onChange={(e) => setDraft({ ...draft, alwaysOn: e.target.checked })}
                  className="h-4 w-4 accent-brand-600"
                />
                دائمة — تدخل في كل محادثة مهما كان الموضوع
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
        open={confirmSkill !== null}
        title="تحذف المهارة؟"
        message={`بتنحذف "${confirmSkill?.title ?? ''}" نهائيًا مع فهرستها.`}
        confirmLabel="احذف"
        onConfirm={() => confirmSkill && void handleDeleteSkill(confirmSkill)}
        onCancel={() => setConfirmSkill(null)}
      />

      <ConfirmDialog
        open={confirmDoc !== null}
        title="تحذف الملف؟"
        message={`بينحذف "${confirmDoc?.filename ?? ''}" مع كل مقاطعه المفهرسة.`}
        confirmLabel="احذف"
        onConfirm={() => confirmDoc && void handleDeleteDoc(confirmDoc)}
        onCancel={() => setConfirmDoc(null)}
      />
    </div>
  );
}
