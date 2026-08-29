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
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
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

export interface SearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface StreamHandlers {
  onChunk: (text: string) => void;
  onStatus?: (text: string) => void;
  onDone: (payload: {
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    durationMs: number;
    partial: boolean;
    sources: SearchSource[];
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
  options: { forceSearch?: boolean } = {},
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...(options.forceSearch ? { forceSearch: true } : {}) }),
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
          } else if (event === 'status') {
            handlers.onStatus?.((payload as { text: string }).text);
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

// ── المهارات وقاعدة المعرفة ──

export interface SkillItem {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  enabled: boolean;
  alwaysOn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  mime: string;
  size: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  preview: string | null;
  textLength: number;
  pageCount: number | null;
  error: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface KnowledgeStats {
  skills: number;
  activeSkills: number;
  documents: number;
  readyDocuments: number;
  chunks: number;
  embedded: number;
}

export interface EmbeddingInfo {
  available: boolean;
  dimensions: number | null;
  source: 'dedicated' | 'chat-model' | 'none';
  modelName: string | null;
  reason: string | null;
}

export interface KnowledgeResponse {
  skills: SkillItem[];
  documents: DocumentItem[];
  stats: KnowledgeStats;
  embedding: EmbeddingInfo;
  supportedTypes: Record<string, string>;
}

export interface SkillDraft {
  title: string;
  description?: string;
  content: string;
  tags?: string[];
  enabled?: boolean;
  alwaysOn?: boolean;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  source: string;
  score: number;
  kind: 'skill' | 'document';
}

export const knowledgeApi = {
  overview: () => api.get<KnowledgeResponse>('/knowledge'),
  createSkill: (draft: SkillDraft) => api.post<SkillItem>('/knowledge/skills', draft),
  updateSkill: (id: string, draft: Partial<SkillDraft>) =>
    api.patch<SkillItem>(`/knowledge/skills/${id}`, draft),
  removeSkill: (id: string) => api.delete<void>(`/knowledge/skills/${id}`),
  removeDocument: (id: string) => api.delete<void>(`/knowledge/documents/${id}`),
  downloadUrl: (id: string) => `/api/knowledge/documents/${id}/download`,
  search: (q: string) =>
    api.get<{ results: RetrievedChunk[] }>(`/knowledge/search?q=${encodeURIComponent(q)}`),
  reindex: () => api.post<{ skills: number; documents: number }>('/knowledge/reindex'),

  upload: async (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return api.post<{ documents: DocumentItem[] }>('/knowledge/documents', form);
  },
};

// ── مشاريع المواقع ──

export interface SiteProjectItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'importing' | 'ready' | 'failed';
  fileCount: number;
  totalBytes: number;
  entryFile: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteFileNode {
  relPath: string;
  size: number;
  mime: string;
  isText: boolean;
}

export interface SiteRevisionItem {
  id: string;
  summary: string;
  changes: { relPath: string; action: string; beforeLength: number; afterLength: number }[];
  createdAt: string;
}

export interface SiteDetail {
  project: SiteProjectItem;
  files: SiteFileNode[];
  revisions: SiteRevisionItem[];
}

export interface DiffPreviewLine {
  kind: string;
  text: string;
}

export interface FileDiff {
  relPath: string;
  action: string;
  added: number;
  removed: number;
  preview: DiffPreviewLine[];
}

export const siteApi = {
  list: () => api.get<{ projects: SiteProjectItem[]; maxArchiveMb: number }>('/sites'),
  get: (id: string) => api.get<SiteDetail>(`/sites/${id}`),
  remove: (id: string) => api.delete<void>(`/sites/${id}`),
  readFile: (id: string, path: string) =>
    api.get<{ path: string; content: string }>(
      `/sites/${id}/file?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (id: string, path: string, content: string) =>
    api.put<{ revisionId: string; changes: number }>(`/sites/${id}/file`, { path, content }),
  revert: (id: string, revisionId: string) =>
    api.post<{ ok: true }>(`/sites/${id}/revert/${revisionId}`),
  downloadUrl: (id: string) => `/api/sites/${id}/download`,
  previewUrl: (id: string) => `/api/sites/${id}/preview/`,

  upload: async (file: File, name?: string) => {
    const form = new FormData();
    form.append('archive', file);
    if (name) form.append('name', name);
    return api.post<{ project: SiteProjectItem; fileCount: number; skipped: number }>(
      '/sites',
      form,
    );
  },
};

export interface EditStreamHandlers {
  onChunk: (text: string) => void;
  onDone: (payload: {
    summary: string;
    revisionId: string | null;
    changed: number;
    diffs: FileDiff[];
    raw?: string;
  }) => void;
  onError: (message: string) => void;
}

/** يطلب تعديل موقع ويستقبل تقدّم المحرك حرفًا بحرف. */
export function streamSiteEdit(
  projectId: string,
  instruction: string,
  handlers: EditStreamHandlers,
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(`/api/sites/${projectId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
        credentials: 'same-origin',
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        handlers.onError(body?.error?.message ?? 'ما قدرنا نعدّل الموقع');
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

          if (event === 'chunk') handlers.onChunk((payload as { text: string }).text);
          else if (event === 'done') handlers.onDone(payload as Parameters<EditStreamHandlers['onDone']>[0]);
          else if (event === 'error') handlers.onError((payload as { message: string }).message);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      handlers.onError('انقطع الاتصال بالسيرفر');
    }
  })();

  return () => controller.abort();
}

// ── البحث الحي ──

export interface SearchStatus {
  autoSearch: boolean;
  provider: string;
  searxngConfigured: boolean;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

export const searchApi = {
  status: () => api.get<SearchStatus>('/search/status'),
  run: (q: string, limit?: number) =>
    api.get<{ query: string; results: SearchSource[]; provider: string }>(
      `/search?q=${encodeURIComponent(q)}${limit ? `&limit=${limit}` : ''}`,
    ),
  page: (url: string) => api.get<PageContent>(`/search/page?url=${encodeURIComponent(url)}`),
};

// ── الاستوديو البصري ──

export type MediaKind = 'image' | 'video' | 'motion';
export type MediaStatus = 'queued' | 'rendering' | 'ready' | 'failed';

export interface MediaAssetItem {
  id: string;
  kind: MediaKind;
  title: string;
  prompt: string;
  status: MediaStatus;
  mime: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sizeBytes: number | null;
  error: string | null;
  hasThumb: boolean;
  createdAt: string;
}

export interface Palette {
  id: string;
  label: string;
  bg: string;
  fg: string;
  accent: string;
  muted: string;
}

export interface ImageTemplate {
  id: string;
  label: string;
  note: string;
  width: number;
  height: number;
  fields: { key: string; label: string; multiline?: boolean; optional?: boolean }[];
}

export interface MotionTemplate {
  id: string;
  label: string;
  note: string;
  defaultDuration: number;
}

export interface StudioResponse {
  renderer: { available: boolean; executablePath: string | null; reason: string | null };
  ffmpeg: { available: boolean; version: string | null };
  imageTemplates: ImageTemplate[];
  motionTemplates: MotionTemplate[];
  palettes: Palette[];
  limits: { maxDurationSec: number; maxFps: number };
  assets: MediaAssetItem[];
}

export const studioApi = {
  overview: (kind?: MediaKind) =>
    api.get<StudioResponse>(`/studio${kind ? `?kind=${kind}` : ''}`),
  createImage: (body: {
    template: string;
    palette: string;
    title: string;
    subtitle?: string;
    badge?: string;
  }) => api.post<MediaAssetItem>('/studio/image', body),
  createMotion: (body: {
    template: string;
    palette: string;
    title: string;
    subtitle?: string;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
  }) => api.post<MediaAssetItem>('/studio/motion', body),
  createVideo: (body: {
    title?: string;
    imageIds: string[];
    secondsPerImage: number;
    fps?: number;
  }) => api.post<MediaAssetItem>('/studio/video', body),
  remove: (id: string) => api.delete<void>(`/studio/${id}`),
  fileUrl: (id: string, thumb = false) => `/api/studio/${id}/file${thumb ? '?thumb=1' : ''}`,
  downloadUrl: (id: string) => `/api/studio/${id}/download`,
};

// ── مفاتيح API ──

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyList {
  keys: ApiKeyItem[];
  scopes: string[];
  labels: Record<string, string>;
}

export const keysApi = {
  list: () => api.get<ApiKeyList>('/keys'),
  issue: (name: string, scopes: string[]) =>
    api.post<{ record: ApiKeyItem; secret: string }>('/keys', { name, scopes }),
  revoke: (id: string) => api.post<{ ok: true }>(`/keys/${id}/revoke`),
  remove: (id: string) => api.delete<void>(`/keys/${id}`),
};
