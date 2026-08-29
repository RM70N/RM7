import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** حوار تأكيد بسيط — نستخدمه قبل أي حذف. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'أكيد',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="card w-full max-w-sm animate-fade-up">
        <h2 id="confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-400">{message}</p>
        <div className="mt-6 flex justify-start gap-2">
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            الغِ
          </button>
        </div>
      </div>
    </div>
  );
}
