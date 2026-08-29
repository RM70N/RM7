import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  ApiError,
  chatApi,
  streamMessage,
  type ChatMessage,
  type ConversationSummary,
  type EngineStatus,
} from '@/lib/api';
import { ChatMessageBubble } from '@/components/ChatMessage';
import { Logo } from '@/components/Logo';
import { Spinner } from '@/components/Spinner';

const SUGGESTIONS = [
  'اشرح لي وش الفرق بين React وVue بالسعودي',
  'اكتب لي سكربت بايثون ينظّم ملفاتي',
  'ساعدني أرتّب خطة مشروع من الصفر',
];

export function ChatPage() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cancelRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── تحميل أولي ──
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [status, list] = await Promise.all([chatApi.engine(), chatApi.list()]);
        if (cancelled) return;
        setEngine(status);
        setConversations(list);
        if (list.length > 0) setActiveId(list[0]!.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'ما قدرنا نحمّل المحادثات');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── تحميل رسائل المحادثة النشطة ──
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const data = await chatApi.get(activeId);
        if (!cancelled) setMessages(data.messages);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // ── التمرير لآخر رسالة ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingText]);

  // ── إلغاء البث عند الخروج ──
  useEffect(() => () => cancelRef.current?.(), []);

  const refreshList = useCallback(async () => {
    try {
      setConversations(await chatApi.list());
    } catch {
      // القائمة تتحدّث المرة الجاية
    }
  }, []);

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setError(null);
    setBusy(true);
    setDraft('');
    setStreamingText('');

    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await chatApi.create();
        conversationId = created.id;
        setActiveId(created.id);
      }

      // نعرض رسالة المستخدم فورًا قبل ما يرد المحرك
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
        model: null,
        inputTokens: null,
        outputTokens: null,
      };
      setMessages((prev) => [...prev, optimistic]);

      await new Promise<void>((resolve) => {
        cancelRef.current = streamMessage(conversationId!, text, {
          onChunk: (chunk) => setStreamingText((prev) => prev + chunk),
          onDone: (payload) => {
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== optimistic.id),
              payload.userMessage,
              payload.assistantMessage,
            ]);
            setStreamingText('');
            void refreshList();
            resolve();
          },
          onError: (message) => {
            setError(message);
            setStreamingText('');
            resolve();
          },
        });
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ما قدرنا نرسل الرسالة');
    } finally {
      cancelRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleStop() {
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(false);
    setStreamingText('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function handleNew() {
    handleStop();
    setActiveId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  }

  if (loading) return <Spinner label="نجهّز الشات…" />;

  const engineDown = engine && !engine.modelPath;
  const isEmpty = messages.length === 0 && !streamingText;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">
      {/* شريط علوي */}
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-ink-900 dark:text-ink-100">
            {conversations.find((c) => c.id === activeId)?.title ?? 'محادثة جديدة'}
          </h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {engine?.modelName
              ? `محرك احسمها · ${engine.gpu === 'cpu' ? 'معالج' : engine.gpu}`
              : 'محرك احسمها'}
          </p>
        </div>
        <button type="button" className="btn-ghost shrink-0 !py-2 text-xs" onClick={() => void handleNew()}>
          محادثة جديدة
        </button>
      </div>

      {/* تنبيه غياب الأوزان */}
      {engineDown ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong className="font-bold">المحرك محتاج أوزان.</strong> نزّلها بالأمر:{' '}
          <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs" dir="ltr">
            npm run engine:pull -w server
          </code>
        </div>
      ) : null}

      {/* الرسائل */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {isEmpty ? (
            <div className="flex flex-col items-center gap-6 py-12 text-center">
              <Logo size={64} />
              <div>
                <h2 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">
                  هلا والله — أنا احسمها
                </h2>
                <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                  قول لي وش تبي وأنا أحسمها لك.
                </p>
              </div>
              <div className="grid w-full max-w-lg gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-xl border border-ink-200 px-4 py-3 text-right text-sm text-ink-600 transition-colors hover:border-brand-500 hover:text-ink-900 dark:border-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
                    onClick={() => {
                      setDraft(s);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  role={message.role}
                  content={message.content}
                />
              ))}
              {streamingText ? (
                <ChatMessageBubble role="assistant" content={streamingText} streaming />
              ) : null}
              {busy && !streamingText ? (
                <div className="flex gap-3">
                  <Logo size={32} />
                  <div className="flex items-center gap-1 pt-2">
                    <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500" />
                    <span
                      className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* صندوق الكتابة */}
      <div className="border-t border-ink-200 px-4 py-3 dark:border-ink-800">
        <form onSubmit={handleSend} className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            className="field max-h-40 min-h-[52px] flex-1 resize-none py-3.5"
            placeholder="اكتب رسالتك… (Enter للإرسال، Shift+Enter لسطر جديد)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={busy}
          />
          {busy ? (
            <button type="button" className="btn-ghost !py-3.5" onClick={handleStop}>
              وقّف
            </button>
          ) : (
            <button type="submit" className="btn-primary !py-3.5" disabled={!draft.trim()}>
              أرسل
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
