import type { SearchSource } from '@/lib/api';

/** يعرض مصادر البحث الحي تحت رد المساعد. */
export function Sources({ sources }: { sources: SearchSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <p className="mb-2 text-xs font-bold text-ink-500 dark:text-ink-400">
        المصادر ({sources.length})
      </p>
      <ol className="space-y-1.5">
        {sources.map((source, index) => (
          <li key={source.url} className="text-xs">
            <span className="text-ink-400 dark:text-ink-500">[{index + 1}]</span>{' '}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-700 hover:underline dark:text-brand-300"
            >
              {source.title}
            </a>
            <span className="ms-1 text-ink-400 dark:text-ink-500" dir="ltr">
              {new URL(source.url).hostname}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
