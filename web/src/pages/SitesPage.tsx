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
  siteApi,
  streamSiteEdit,
  type FileDiff,
  type SiteDetail,
  type SiteProjectItem,
} from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SitePreview } from '@/components/SitePreview';
import { DiffView } from '@/components/DiffView';

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} ميغا`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} كيلو`;
  return `${bytes} بايت`;
}

export function SitesPage() {
  const [projects, setProjects] = useState<SiteProjectItem[]>([]);
  const [maxMb, setMaxMb] = useState(100);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState(false);
  const [editLog, setEditLog] = useState('');
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [editSummary, setEditSummary] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  const [tab, setTab] = useState<'preview' | 'files' | 'history'>('preview');
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SiteProjectItem | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await siteApi.list();
      setProjects(data.projects);
      setMaxMb(data.maxArchiveMb);
      setError(null);
      return data.projects;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل المشاريع');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await siteApi.get(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل المشروع');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const list = await loadList();
      if (list.length > 0 && !activeId) setActiveId(list[0]!.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  useEffect(() => {
    if (activeId) void loadDetail(activeId);
    else setDetail(null);
  }, [activeId, loadDetail]);

  useEffect(() => () => cancelRef.current?.(), []);

  async function handleUpload(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await siteApi.upload(file);
      setNotice(
        `رفعنا "${result.project.name}" — ${result.fileCount} ملف` +
          (result.skipped > 0 ? ` (تجاهلنا ${result.skipped})` : ''),
      );
      await loadList();
      setActiveId(result.project.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نرفع الموقع');
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

  function handleEdit(event: FormEvent) {
    event.preventDefault();
    const text = instruction.trim();
    if (!text || !activeId || editing) return;

    setEditing(true);
    setEditLog('');
    setDiffs([]);
    setEditSummary(null);
    setError(null);

    cancelRef.current = streamSiteEdit(activeId, text, {
      onChunk: (chunk) => setEditLog((prev) => prev + chunk),
      onDone: (payload) => {
        setEditSummary(payload.summary);
        setDiffs(payload.diffs);
        setEditing(false);
        setInstruction('');
        cancelRef.current = null;

        if (payload.changed > 0) {
          setPreviewVersion((v) => v + 1);
          void loadDetail(activeId);
        }
      },
      onError: (message) => {
        setError(message);
        setEditing(false);
        cancelRef.current = null;
      },
    });
  }

  function handleStop() {
    cancelRef.current?.();
    cancelRef.current = null;
    setEditing(false);
  }

  async function handleOpenFile(path: string) {
    if (!activeId) return;
    try {
      const data = await siteApi.readFile(activeId, path);
      setOpenFile({ path: data.path, content: data.content });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نفتح الملف');
    }
  }

  async function handleSaveFile() {
    if (!activeId || !openFile) return;
    try {
      await siteApi.writeFile(activeId, openFile.path, openFile.content);
      setOpenFile(null);
      setPreviewVersion((v) => v + 1);
      await loadDetail(activeId);
      setNotice('حفظنا التعديل');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحفظ');
    }
  }

  async function handleRevert(revisionId: string) {
    if (!activeId) return;
    try {
      await siteApi.revert(activeId, revisionId);
      setPreviewVersion((v) => v + 1);
      setDiffs([]);
      setEditSummary(null);
      await loadDetail(activeId);
      setNotice('رجّعنا الموقع للنسخة السابقة');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نرجّع');
    }
  }

  async function handleDeleteProject(project: SiteProjectItem) {
    setConfirmDelete(null);
    try {
      await siteApi.remove(project.id);
      const list = await loadList();
      setActiveId(list[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحذف');
    }
  }

  if (loading) return <Spinner label="نحمّل المواقع…" />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">
          المواقع المرفوعة
        </h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          ارفع موقعك كامل، وخل احسمها يعدّل ويطوّر فيه — مع معاينة مباشرة ورجوع بأي وقت.
        </p>
      </header>

      {projects.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            'rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors',
            dragOver ? 'border-brand-500 bg-brand-600/5' : 'border-ink-300 dark:border-ink-700',
          ].join(' ')}
        >
          <p className="text-lg font-bold text-ink-800 dark:text-ink-200">
            {uploading ? 'نرفع الموقع…' : 'اسحب ملف ZIP هنا'}
          </p>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            موقع كامل: HTML وCSS وJS — حتى {maxMb} ميغا
          </p>
          <button
            type="button"
            className="btn-primary mt-5"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            اختر ملف ZIP
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field !w-auto !py-2"
            value={activeId ?? ''}
            onChange={(e) => setActiveId(e.target.value)}
            aria-label="اختر المشروع"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.fileCount} ملف)
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn-ghost !py-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'نرفع…' : 'ارفع موقع ثاني'}
          </button>

          {activeId ? (
            <>
              <a href={siteApi.downloadUrl(activeId)} className="btn-ghost !py-2" download>
                حمّل ZIP
              </a>
              <button
                type="button"
                className="btn-ghost !py-2 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                onClick={() =>
                  setConfirmDelete(projects.find((p) => p.id === activeId) ?? null)
                }
              >
                احذف المشروع
              </button>
            </>
          ) : null}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleFileInput}
        aria-label="اختر ملف ZIP"
      />

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

      {activeId && detail ? (
        <>
          {/* صندوق التعديل */}
          <form onSubmit={handleEdit} className="card space-y-3">
            <label htmlFor="instruction" className="block text-sm font-bold">
              وش تبي تعدّل؟
            </label>
            <textarea
              id="instruction"
              className="field min-h-[80px] resize-y"
              placeholder="مثال: خل الموقع دارك مود، وزد قسم تواصل معنا تحت"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={editing}
            />
            <div className="flex gap-2">
              {editing ? (
                <button type="button" className="btn-ghost" onClick={handleStop}>
                  وقّف
                </button>
              ) : (
                <button type="submit" className="btn-primary" disabled={!instruction.trim()}>
                  نفّذ
                </button>
              )}
            </div>

            {editing && editLog ? (
              <div className="max-h-40 overflow-auto rounded-xl bg-ink-100 p-3 dark:bg-ink-950">
                <pre className="whitespace-pre-wrap text-[12px] text-ink-500 dark:text-ink-400">
                  {editLog.slice(-1500)}
                </pre>
              </div>
            ) : null}
          </form>

          {/* نتيجة التعديل */}
          {editSummary ? (
            <section className="card space-y-3">
              <h2 className="text-base font-bold">ملخص التغييرات</h2>
              <p className="whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-400">
                {editSummary}
              </p>
              {diffs.length > 0 ? (
                <div className="space-y-2">
                  {diffs.map((diff) => (
                    <DiffView key={diff.relPath} diff={diff} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500 dark:text-ink-400">ما تغيّر أي ملف.</p>
              )}
            </section>
          ) : null}

          {/* التبويبات */}
          <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
            {(
              [
                ['preview', 'معاينة'],
                ['files', `الملفات (${detail.files.length})`],
                ['history', `السجل (${detail.revisions.length})`],
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

          {tab === 'preview' ? (
            <div className="h-[65dvh] overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800">
              <SitePreview projectId={activeId} version={previewVersion} />
            </div>
          ) : null}

          {tab === 'files' ? (
            <ul className="divide-y divide-ink-200 rounded-2xl border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {detail.files.map((file) => (
                <li key={file.relPath} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="truncate font-mono text-sm" dir="ltr">
                    {file.relPath}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink-400 dark:text-ink-500">
                      {humanSize(file.size)}
                    </span>
                    {file.isText ? (
                      <button
                        type="button"
                        className="btn-ghost !px-2 !py-1 text-xs"
                        onClick={() => void handleOpenFile(file.relPath)}
                      >
                        افتح
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === 'history' ? (
            detail.revisions.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-500 dark:text-ink-400">
                ما فيه تعديلات بعد.
              </p>
            ) : (
              <ul className="space-y-2">
                {detail.revisions.map((revision) => (
                  <li key={revision.id} className="card !p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{revision.summary}</p>
                        <p className="mt-1 text-xs text-ink-400 dark:text-ink-500">
                          {revision.changes.length} ملف ·{' '}
                          {new Intl.DateTimeFormat('ar-SA', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(revision.createdAt))}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-ghost shrink-0 !py-1.5 text-xs"
                        onClick={() => void handleRevert(revision.id)}
                      >
                        ارجع لهنا
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}

      {/* محرّر ملف */}
      {openFile ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenFile(null);
          }}
        >
          <div className="card flex max-h-[90dvh] w-full max-w-3xl flex-col">
            <h2 className="font-mono text-sm font-bold" dir="ltr">
              {openFile.path}
            </h2>
            <textarea
              className="field mt-3 min-h-[50dvh] flex-1 resize-none font-mono text-[13px]"
              dir="ltr"
              value={openFile.content}
              onChange={(e) => setOpenFile({ ...openFile, content: e.target.value })}
              aria-label="محتوى الملف"
            />
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary" onClick={() => void handleSaveFile()}>
                احفظ
              </button>
              <button type="button" className="btn-ghost" onClick={() => setOpenFile(null)}>
                الغِ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="تحذف المشروع؟"
        message={`بينحذف "${confirmDelete?.name ?? ''}" بكل ملفاته ونسخه الاحتياطية نهائيًا.`}
        confirmLabel="احذف"
        onConfirm={() => confirmDelete && void handleDeleteProject(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
