export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 font-extrabold text-brand-50"
      style={{ width: size, height: size, fontSize: size * 0.44 }}
      aria-hidden="true"
    >
      ح
    </span>
  );
}

export function Wordmark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Logo />
      <div className="leading-tight">
        <div className="text-base font-extrabold text-ink-900 dark:text-ink-50">احسمها AI</div>
        {subtitle ? (
          <div className="text-xs text-ink-500 dark:text-ink-400">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
