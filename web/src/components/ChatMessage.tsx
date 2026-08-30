import { Logo } from './Logo';

interface Props {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}

/**
 * يعرض نص الرد مع دعم بسيط للكود والقوائم — بدون مكتبة ماركداون
 * حتى تبقى الحزمة خفيفة والعرض آمن (ما نحقن HTML أبدًا).
 */
function renderContent(text: string) {
  const blocks = text.split(/```/);

  return blocks.map((block, index) => {
    // الأجزاء الفردية داخل ``` = كود
    if (index % 2 === 1) {
      const newline = block.indexOf('\n');
      const lang = newline > 0 ? block.slice(0, newline).trim() : '';
      const code = newline > 0 ? block.slice(newline + 1) : block;

      return (
        <div key={index} className="my-3 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
          {lang ? (
            <div className="border-b border-ink-200 bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">
              {lang}
            </div>
          ) : null}
          <pre className="overflow-x-auto bg-ink-100 p-3 dark:bg-ink-800" dir="ltr">
            <code className="font-mono text-[13px] leading-relaxed">{code.replace(/\n$/, '')}</code>
          </pre>
        </div>
      );
    }

    return (
      <span key={index} className="whitespace-pre-wrap">
        {block}
      </span>
    );
  });
}

export function ChatMessageBubble({ role, content, streaming }: Props) {
  if (role === 'user') {
    return (
      <div className="flex animate-fade-up justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-brand-600 px-4 py-3 text-white sm:max-w-[75%]">
          <div className="text-[15px] leading-relaxed">{renderContent(content)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-fade-up gap-3">
      <Logo size={32} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[15px] leading-relaxed text-ink-800 dark:text-ink-200">
          {renderContent(content)}
          {streaming ? (
            <span className="ms-1 inline-block h-4 w-[2px] animate-pulse-dot bg-brand-500 align-middle" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
