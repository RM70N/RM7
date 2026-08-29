interface Props {
  title: string;
  description: string;
  phase: string;
}

/** صفحة قيد الإنشاء — تُستبدل بالمحتوى الحقيقي في مرحلتها. */
export function PagePlaceholder({ title, description, phase }: Props) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-10 sm:px-6 lg:py-14">
      <span className="inline-block rounded-full bg-brand-600/10 px-3 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
        {phase}
      </span>
      <h1 className="mt-4 text-2xl font-extrabold text-ink-900 dark:text-ink-50">{title}</h1>
      <p className="mt-3 leading-relaxed text-ink-600 dark:text-ink-400">{description}</p>
    </div>
  );
}
