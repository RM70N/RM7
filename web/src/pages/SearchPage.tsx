import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, searchApi, type PageContent, type SearchSource } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { SearchIcon } from '@/components/Icons';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchSource[] | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<PageContent | null>(null);
  const [pageBusy, setPageBusy] = useState(false);
  const [status, setStatus] = useState<{ autoSearch: boolean; searxngConfigured: boolean } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        const data = await searchApi.status();
        setStatus(data);
        setProvider(data.provider);
      } catch {
        // الحالة مو ضرورية للبحث
      }
    })();
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    setResults(null);
    setPage(null);
    try {
      const data = await searchApi.run(q);
      setResults(data.results);
      setProvider(data.provider);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نبحث');
    } finally {
      setBusy(false);
    }
  }

  async function handleReadPage(url: string) {
    setPageBusy(true);
    setError(null);
    try {
      setPage(await searchApi.page(url));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نقرأ الصفحة');
    } finally {
      setPageBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up space-y-5 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">البحث الحي</h1>
        <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
          بحث مباشر على الإنترنت مع المصادر. احسمها يستخدمه تلقائيًا لما سؤالك
          يحتاج معلومة محدثة.
        </p>
      </header>

      {status ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-ink-200/60 px-3 py-1 text-ink-600 dark:bg-ink-800 dark:text-ink-400">
            المزوّد: {provider === 'searxng' ? 'SearxNG (عندك)' : 'DuckDuckGo'}
          </span>
          <span className="rounded-full bg-ink-200/60 px-3 py-1 text-ink-600 dark:bg-ink-800 dark:text-ink-400">
            البحث التلقائي: {status.autoSearch ? 'مفعّل' : 'مطفي'}
          </span>
        </div>
      ) : null}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          className="field flex-1"
          placeholder="وش تبي تعرف؟"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={busy || !query.trim()}>
          <SearchIcon className="h-4 w-4" />
          {busy ? 'ندوّر…' : 'دوّر'}
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {busy ? <Spinner label="ندوّر لك…" /> : null}

      {results !== null && !busy ? (
        results.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500 dark:text-ink-400">
            ما لقينا نتائج. جرّب كلمات ثانية.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={result.url} className="card !p-4">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-bold text-brand-700 hover:underline dark:text-brand-300"
                >
                  {result.title}
                </a>
                <p className="mt-1 truncate text-xs text-ink-400 dark:text-ink-500" dir="ltr">
                  {result.url}
                </p>
                {result.snippet ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-400">
                    {result.snippet}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost mt-2 !px-2 !py-1 text-xs"
                  onClick={() => void handleReadPage(result.url)}
                  disabled={pageBusy}
                >
                  اقرأ الصفحة
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {pageBusy ? <Spinner label="نقرأ الصفحة…" /> : null}

      {page ? (
        <section className="card space-y-3">
          <div>
            <h2 className="font-bold">{page.title}</h2>
            <p className="truncate text-xs text-ink-400 dark:text-ink-500" dir="ltr">
              {page.url}
            </p>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl bg-ink-100 p-3 dark:bg-ink-950">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700 dark:text-ink-300">
              {page.text}
            </p>
          </div>
          {page.truncated ? (
            <p className="text-xs text-ink-400 dark:text-ink-500">
              الصفحة طويلة — عرضنا أول جزء منها.
            </p>
          ) : null}
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setPage(null)}>
            اقفل
          </button>
        </section>
      ) : null}
    </div>
  );
}
