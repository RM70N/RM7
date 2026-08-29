/** خطأ تطبيقي معروف — يُعرض للمستخدم برسالة عربية واضحة. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.detail = detail;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, detail?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, detail);

export const unauthorized = (message = 'لازم تسجّل دخول أول') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'ما عندك صلاحية لهذا الشي') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'ما لقينا اللي تدور عليه') =>
  new AppError(404, 'NOT_FOUND', message);

export const tooManyRequests = (message = 'محاولات كثيرة — استنى شوي وجرب مرة ثانية') =>
  new AppError(429, 'TOO_MANY_REQUESTS', message);

export const serverError = (message = 'صار خلل داخلي، جرب مرة ثانية', detail?: unknown) =>
  new AppError(500, 'SERVER_ERROR', message, detail);
