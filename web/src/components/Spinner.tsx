export function Spinner({ label = 'لحظة…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-sm text-ink-500 dark:text-ink-400">
      <span className="flex gap-1" aria-hidden="true">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500" />
        <span
          className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span>{label}</span>
    </div>
  );
}
