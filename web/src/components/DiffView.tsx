import type { FileDiff } from '@/lib/api';

const LINE_STYLES: Record<string, string> = {
  add: 'bg-brand-600/10 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200',
  remove: 'bg-red-500/10 text-red-800 dark:text-red-300',
  same: 'text-ink-500 dark:text-ink-400',
  gap: 'text-ink-300 dark:text-ink-600',
};

const PREFIX: Record<string, string> = { add: '+', remove: '-', same: ' ', gap: '' };

/** يعرض فرق ملف واحد بأسطر ملوّنة. */
export function DiffView({ diff }: { diff: FileDiff }) {
  return (
    <details className="rounded-xl border border-ink-200 dark:border-ink-800" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
        <span className="font-mono" dir="ltr">
          {diff.relPath}
        </span>
        <span className="ms-2 text-xs font-normal text-ink-500 dark:text-ink-400">
          {diff.action === 'create' ? 'ملف جديد' : diff.action === 'delete' ? 'محذوف' : 'معدّل'}
          {' · '}
          <span className="text-brand-600 dark:text-brand-400">+{diff.added}</span>
          {' '}
          <span className="text-red-600 dark:text-red-400">−{diff.removed}</span>
        </span>
      </summary>

      <div className="max-h-80 overflow-auto border-t border-ink-200 bg-ink-100 dark:border-ink-800 dark:bg-ink-950">
        <pre className="p-2 text-[12px] leading-relaxed" dir="ltr">
          {diff.preview.map((line, index) => (
            <div key={index} className={`px-2 font-mono ${LINE_STYLES[line.kind] ?? ''}`}>
              {PREFIX[line.kind] ?? ' '}
              {line.text || ' '}
            </div>
          ))}
        </pre>
      </div>
    </details>
  );
}
