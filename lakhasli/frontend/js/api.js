import { auth, API_BASE_URL } from './firebase-config.js';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new ApiError('يجب تسجيل الدخول للمتابعة.', 401);
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse(res) {
  if (res.status === 204) return null;
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* رد بدون محتوى JSON */
  }
  if (!res.ok) {
    throw new ApiError(body?.error || 'صار خطأ غير متوقع.', res.status);
  }
  return body;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function request(path, options = {}) {
  if (isOffline()) {
    throw new ApiError('ما فيه اتصال بالإنترنت حاليًا. تأكد من اتصالك وحاول مرة ثانية.', 0);
  }
  try {
    const headers = { ...(await authHeader()), ...(options.headers || {}) };
    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    return await handleResponse(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('فقدنا الاتصال بالسيرفر. تحقق من اتصالك وحاول مرة ثانية.', 0);
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, data) =>
    request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  async getBlob(path) {
    if (isOffline()) {
      throw new ApiError('ما فيه اتصال بالإنترنت حاليًا. تأكد من اتصالك وحاول مرة ثانية.', 0);
    }
    try {
      const headers = await authHeader();
      const res = await fetch(`${API_BASE_URL}${path}`, { headers });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(body?.error || 'صار خطأ غير متوقع.', res.status);
      }
      return await res.blob();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('فقدنا الاتصال بالسيرفر. تحقق من اتصالك وحاول مرة ثانية.', 0);
    }
  },

  async uploadLecture(formData, onProgress) {
    const headers = await authHeader();
    return new Promise((resolve, reject) => {
      if (isOffline()) {
        reject(new ApiError('ما فيه اتصال بالإنترنت حاليًا.', 0));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/api/lectures`);
      xhr.setRequestHeader('Authorization', headers.Authorization);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* تجاهل */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          reject(new ApiError(body?.error || 'فشل رفع الملف.', xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('فقدنا الاتصال أثناء الرفع. تحقق من اتصالك وحاول مرة ثانية.', 0));
      xhr.send(formData);
    });
  },

  // رفع ملف عام (FormData) بدون Content-Type يدوي — المتصفح يحدد boundary تلقائيًا.
  async postForm(path, formData) {
    if (isOffline()) {
      throw new ApiError('ما فيه اتصال بالإنترنت حاليًا. تأكد من اتصالك وحاول مرة ثانية.', 0);
    }
    try {
      const headers = await authHeader();
      const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers, body: formData });
      return await handleResponse(res);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError('فقدنا الاتصال بالسيرفر. تحقق من اتصالك وحاول مرة ثانية.', 0);
    }
  },
};

export { ApiError };
