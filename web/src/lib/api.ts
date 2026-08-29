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
