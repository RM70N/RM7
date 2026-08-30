import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  studioApi,
  type MediaAssetItem,
  type MediaKind,
  type StudioResponse,
} from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const KIND_LABELS: Record<MediaKind, string> = {
  image: 'صور',
  motion: 'موشن جرافيك',
  video: 'فيديو',
};

const STATUS_LABELS = {
  queued: 'بالانتظار',
  rendering: 'نرسمها…',
  ready: 'جاهز',
  failed: 'فشل',
} as const;

function humanSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} ميغا`;
  return `${Math.round(bytes / 1024)} كيلو`;
}

export function StudioPage() {
  const [data, setData] = useState<StudioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MediaKind>('image');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MediaAssetItem | null>(null);
  const [preview, setPreview] = useState<MediaAssetItem | null>(null);

  // نموذج الصورة
  const [imgTemplate, setImgTemplate] = useState('cover');
  const [imgPalette, setImgPalette] = useState('night');
  const [imgTitle, setImgTitle] = useState('');
  const [imgSubtitle, setImgSubtitle] = useState('');
  const [imgBadge, setImgBadge] = useState('');

  // نموذج الموشن
  const [motTemplate, setMotTemplate] = useState('intro');
  const [motPalette, setMotPalette] = useState('night');
  const [motTitle, setMotTitle] = useState('');
  const [motSubtitle, setMotSubtitle] = useState('');
  const [motDuration, setMotDuration] = useState(4);
  const [motSize, setMotSize] = useState('960x540');
  const [motFps, setMotFps] = useState(24);

  // نموذج الفيديو
  const [selected, setSelected] = useState<string[]>([]);
  const [perImage, setPerImage] = useState(2);

  const load = useCallback(async () => {
    try {
      setData(await studioApi.overview());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل الاستوديو');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateImage(event: FormEvent) {
    event.preventDefault();
    if (busy || !imgTitle.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await studioApi.createImage({
        template: imgTemplate,
        palette: imgPalette,
        title: imgTitle,
        ...(imgSubtitle.trim() ? { subtitle: imgSubtitle } : {}),
        ...(imgBadge.trim() ? { badge: imgBadge } : {}),
      });
      setImgTitle('');
      setImgSubtitle('');
      setImgBadge('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نولّد الصورة');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateMotion(event: FormEvent) {
    event.preventDefault();
    if (busy || !motTitle.trim()) return;

    const [w, h] = motSize.split('x').map(Number);
    setBusy(true);
    setError(null);
    try {
      await studioApi.createMotion({
        template: motTemplate,
        palette: motPalette,
        title: motTitle,
        ...(motSubtitle.trim() ? { subtitle: motSubtitle } : {}),
        durationSec: motDuration,
        width: w ?? 960,
        height: h ?? 540,
        fps: motFps,
      });
      setMotTitle('');
      setMotSubtitle('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نولّد الموشن');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateVideo(event: FormEvent) {
    event.preventDefault();
    if (busy || selected.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      await studioApi.createVideo({
        title: 'عرض صور',
        imageIds: selected,
        secondsPerImage: perImage,
        fps: 24,
      });
      setSelected([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نركّب الفيديو');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(asset: MediaAssetItem) {
    setConfirmDelete(null);
    try {
      await studioApi.remove(asset.id);
      setSelected((prev) => prev.filter((id) => id !== asset.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نحذف');
    }
  }

  if (loading) return <Spinner label="نجهّز الاستوديو…" />;
  if (!data) return null;

  const assets = data.assets.filter((a) => a.kind === tab);
  const images = data.assets.filter((a) => a.kind === 'image' && a.status === 'ready');
  const ready = data.renderer.available;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">
          الاستوديو البصري
        </h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          صور وموشن جرافيك وفيديو — كلها تُرسم على سيرفرك، بدون أي خدمة خارجية.
        </p>
      </header>

      {!ready ? (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {data.renderer.reason}
        </div>
      ) : null}
      {!data.ffmpeg.available ? (
        <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          ما لقينا ffmpeg — الصور تشتغل، بس الفيديو والموشن يحتاجونه.
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-ink-200 dark:border-ink-800">
        {(['image', 'motion', 'video'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setTab(kind)}
            className={[
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              tab === kind
                ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200',
            ].join(' ')}
          >
            {KIND_LABELS[kind]} ({data.assets.filter((a) => a.kind === kind).length})
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {/* نماذج التوليد */}
      {tab === 'image' ? (
        <form onSubmit={handleCreateImage} className="card space-y-4">
          <h2 className="text-base font-bold">صورة جديدة</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="img-tpl" className="block text-sm font-semibold">القالب</label>
              <select id="img-tpl" className="field" value={imgTemplate} onChange={(e) => setImgTemplate(e.target.value)}>
                {data.imageTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} — {t.width}×{t.height}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="img-pal" className="block text-sm font-semibold">الألوان</label>
              <select id="img-pal" className="field" value={imgPalette} onChange={(e) => setImgPalette(e.target.value)}>
                {data.palettes.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="img-title" className="block text-sm font-semibold">العنوان</label>
            <textarea
              id="img-title"
              className="field min-h-[70px] resize-y"
              value={imgTitle}
              onChange={(e) => setImgTitle(e.target.value)}
              placeholder="اكتب النص الرئيسي"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="img-sub" className="block text-sm font-semibold">السطر الثاني</label>
              <input id="img-sub" className="field" value={imgSubtitle} onChange={(e) => setImgSubtitle(e.target.value)} placeholder="اختياري" />
            </div>
            <div className="space-y-2">
              <label htmlFor="img-badge" className="block text-sm font-semibold">شارة</label>
              <input id="img-badge" className="field" value={imgBadge} onChange={(e) => setImgBadge(e.target.value)} placeholder="اختياري" />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={busy || !ready || !imgTitle.trim()}>
            {busy ? 'نرسمها…' : 'ولّد الصورة'}
          </button>
        </form>
      ) : null}

      {tab === 'motion' ? (
        <form onSubmit={handleCreateMotion} className="card space-y-4">
          <h2 className="text-base font-bold">موشن جرافيك جديد</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="mot-tpl" className="block text-sm font-semibold">القالب</label>
              <select id="mot-tpl" className="field" value={motTemplate} onChange={(e) => setMotTemplate(e.target.value)}>
                {data.motionTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} — {t.note}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="mot-pal" className="block text-sm font-semibold">الألوان</label>
              <select id="mot-pal" className="field" value={motPalette} onChange={(e) => setMotPalette(e.target.value)}>
                {data.palettes.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="mot-title" className="block text-sm font-semibold">العنوان</label>
            <input id="mot-title" className="field" value={motTitle} onChange={(e) => setMotTitle(e.target.value)} placeholder="النص المتحرك" required />
          </div>

          <div className="space-y-2">
            <label htmlFor="mot-sub" className="block text-sm font-semibold">السطر الثاني</label>
            <input id="mot-sub" className="field" value={motSubtitle} onChange={(e) => setMotSubtitle(e.target.value)} placeholder="اختياري" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="mot-dur" className="block text-sm font-semibold">المدة: {motDuration} ثانية</label>
              <input id="mot-dur" type="range" min={1} max={data.limits.maxDurationSec} value={motDuration}
                onChange={(e) => setMotDuration(Number(e.target.value))} className="w-full accent-brand-600" />
            </div>
            <div className="space-y-2">
              <label htmlFor="mot-size" className="block text-sm font-semibold">المقاس</label>
              <select id="mot-size" className="field" value={motSize} onChange={(e) => setMotSize(e.target.value)}>
                <option value="960x540">عريض 960×540</option>
                <option value="1280x720">HD 1280×720</option>
                <option value="1080x1080">مربع 1080×1080</option>
                <option value="1080x1920">ستوري 1080×1920</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="mot-fps" className="block text-sm font-semibold">الإطارات</label>
              <select id="mot-fps" className="field" value={motFps} onChange={(e) => setMotFps(Number(e.target.value))}>
                <option value={24}>24</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-ink-400 dark:text-ink-500">
            الرندر يأخذ وقتًا — كل ثانية فيديو تعني {motFps} إطار مرسوم.
          </p>

          <button type="submit" className="btn-primary" disabled={busy || !ready || !data.ffmpeg.available || !motTitle.trim()}>
            {busy ? 'نرندر…' : 'ولّد الموشن'}
          </button>
        </form>
      ) : null}

      {tab === 'video' ? (
        <form onSubmit={handleCreateVideo} className="card space-y-4">
          <h2 className="text-base font-bold">فيديو من صور</h2>

          {images.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              ولّد صورًا أول من تبويب الصور، وبعدين ركّبها فيديو من هنا.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                اختر الصور بالترتيب اللي تبيه ({selected.length} مختارة)
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {images.map((image) => {
                  const index = selected.indexOf(image.id);
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) =>
                          prev.includes(image.id)
                            ? prev.filter((id) => id !== image.id)
                            : [...prev, image.id],
                        )
                      }
                      className={[
                        'relative aspect-square overflow-hidden rounded-xl border-2 transition-colors',
                        index >= 0 ? 'border-brand-500' : 'border-transparent hover:border-ink-300 dark:hover:border-ink-700',
                      ].join(' ')}
                    >
                      <img src={studioApi.fileUrl(image.id)} alt={image.title} className="h-full w-full object-cover" />
                      {index >= 0 ? (
                        <span className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                          {index + 1}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <label htmlFor="vid-per" className="block text-sm font-semibold">
                  مدة كل صورة: {perImage} ثانية
                </label>
                <input id="vid-per" type="range" min={0.5} max={10} step={0.5} value={perImage}
                  onChange={(e) => setPerImage(Number(e.target.value))} className="w-full accent-brand-600" />
              </div>

              <button type="submit" className="btn-primary" disabled={busy || !data.ffmpeg.available || selected.length === 0}>
                {busy ? 'نركّب…' : 'ركّب الفيديو'}
              </button>
            </>
          )}
        </form>
      ) : null}

      {/* المعرض */}
      {assets.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500 dark:text-ink-400">
          ما فيه {KIND_LABELS[tab]} بعد.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id} className="card !p-3">
              <div className="mb-2 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-950">
                {asset.status === 'ready' ? (
                  asset.kind === 'image' ? (
                    <button type="button" onClick={() => setPreview(asset)} className="block w-full">
                      <img src={studioApi.fileUrl(asset.id)} alt={asset.title} className="w-full object-contain" loading="lazy" />
                    </button>
                  ) : (
                    <video src={studioApi.fileUrl(asset.id)} controls className="w-full" preload="metadata" />
                  )
                ) : (
                  <div className="flex h-32 items-center justify-center text-sm text-ink-500 dark:text-ink-400">
                    {STATUS_LABELS[asset.status]}
                  </div>
                )}
              </div>

              <p className="truncate text-sm font-bold">{asset.title}</p>
              <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">
                {asset.width}×{asset.height}
                {asset.durationMs ? ` · ${(asset.durationMs / 1000).toFixed(1)}ث` : ''}
                {' · '}{humanSize(asset.sizeBytes)}
              </p>
              {asset.error ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{asset.error}</p>
              ) : null}

              <div className="mt-2 flex gap-1">
                {asset.status === 'ready' ? (
                  <a href={studioApi.downloadUrl(asset.id)} className="btn-ghost !px-2 !py-1 text-xs" download>
                    حمّل
                  </a>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  onClick={() => setConfirmDelete(asset)}
                >
                  احذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <img
            src={studioApi.fileUrl(preview.id)}
            alt={preview.title}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="تحذف الملف؟"
        message={`بينحذف "${confirmDelete?.title ?? ''}" نهائيًا.`}
        confirmLabel="احذف"
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
