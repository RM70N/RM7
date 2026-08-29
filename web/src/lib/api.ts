/** خطأ قادم من السيرفر برسالة عربية جاهزة للعرض. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; fields?: { path: string; message: string }[] };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers:
        init.body instanceof FormData
          ? (init.headers ?? {})
          : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'ما قدرنا نوصل للسيرفر — تأكد أنه شغّال');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'صار خطأ غير متوقع',
      body.error?.fields,
    );
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── أنواع مشتركة ──

export interface OwnerProfile {
  id: string;
  displayName: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionState {
  authenticated: boolean;
  owner: OwnerProfile | null;
}

export const authApi = {
  status: () => api.get<{ initialized: boolean }>('/auth/status'),
  /** يرجع 200 دائمًا — نستخدمه للفحص الأولي بدون أخطاء في الكونسول. */
  session: () => api.get<SessionState>('/auth/session'),
  me: () => api.get<OwnerProfile>('/auth/me'),
  login: (password: string) => api.post<{ ok: true; expiresAt: string }>('/auth/login', { password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true; message: string }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),
};

// ── الشات ومحرك احسمها ──

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
  messageCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface EngineStatus {
  ready: boolean;
  modelPath: string | null;
  modelName: string | null;
  modelSizeBytes: number | null;
  contextSize: number | null;
  gpu: string;
  cpuCores: number;
  llamaRelease: string | null;
  catalog: {
    id: string;
    label: string;
    note: string;
    sizeGb: number;
    minRamGb: number;
    saudi: number;
  }[];
}

export const chatApi = {
  engine: () => api.get<EngineStatus>('/chat/engine'),
  list: () => api.get<ConversationSummary[]>('/chat/conversations'),
  create: (title?: string) =>
    api.post<{ id: string; title: string }>('/chat/conversations', { title }),
  get: (id: string) =>
    api.get<{ conversation: { id: string; title: string }; messages: ChatMessage[] }>(
      `/chat/conversations/${id}`,
    ),
  rename: (id: string, title: string) =>
    api.patch<{ id: string }>(`/chat/conversations/${id}`, { title }),
  pin: (id: string, pinned: boolean) =>
    api.patch<{ id: string }>(`/chat/conversations/${id}/pin`, { pinned }),
  remove: (id: string) => api.delete<void>(`/chat/conversations/${id}`),
};

export interface StreamHandlers {
  onChunk: (text: string) => void;
  onDone: (payload: {
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    durationMs: number;
    partial: boolean;
  }) => void;
  onError: (message: string) => void;
}

/**
 * يرسل رسالة ويستقبل الرد حرفًا بحرف عبر SSE.
 * يرجع دالة إلغاء توقف البث.
 */
export function streamMessage(
  conversationId: string,
  text: string,
  handlers: StreamHandlers,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        handlers.onError(body?.error?.message ?? 'المحرك ما قدر يرد');
        return;
      }
      if (!response.body) {
        handlers.onError('ما وصلنا أي رد من السيرفر');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const lines = block.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event: '));
          const dataLine = lines.find((l) => l.startsWith('data: '));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          let payload: unknown;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (event === 'chunk') {
            handlers.onChunk((payload as { text: string }).text);
          } else if (event === 'done') {
            handlers.onDone(payload as Parameters<StreamHandlers['onDone']>[0]);
          } else if (event === 'error') {
            handlers.onError((payload as { message: string }).message);
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      handlers.onError('انقطع الاتصال بالسيرفر');
    }
  })();

  return () => controller.abort();
}

// ── الذاكرة الدائمة ──

export type MemoryCategory = 'personal' | 'preference' | 'project' | 'fact' | 'instruction';

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  pinned: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  total: number;
  pinned: number;
  auto: number;
  manual: number;
  byCategory: Record<string, number>;
}

export interface MemoryListResponse {
  memories: MemoryItem[];
  stats: MemoryStats;
  labels: Record<MemoryCategory, string>;
}

export interface MemoryDraft {
  title: string;
  content: string;
  category?: MemoryCategory;
  importance?: number;
  pinned?: boolean;
}

export const memoryApi = {
  list: (params?: { category?: MemoryCategory; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    const suffix = query.toString();
    return api.get<MemoryListResponse>(`/memory${suffix ? `?${suffix}` : ''}`);
  },
  create: (draft: MemoryDraft) => api.post<MemoryItem>('/memory', draft),
  update: (id: string, draft: Partial<MemoryDraft>) =>
    api.patch<MemoryItem>(`/memory/${id}`, draft),
  remove: (id: string) => api.delete<void>(`/memory/${id}`),
  clear: (source?: 'auto' | 'manual') =>
    api.post<{ ok: true; removed: number }>('/memory/clear', { source }),
};
