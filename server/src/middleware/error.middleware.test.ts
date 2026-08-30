import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DEGRADED_CODES, errorHandler, notFoundHandler } from './error.middleware.js';
import { AppError } from '../lib/errors.js';

/** ردّ وهمي يلتقط الحالة والجسم بدل ما يكتب على الشبكة. */
function fakeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    headersSent: false,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  return { res, captured };
}

const noopNext = () => undefined;

describe('معالج الأخطاء', () => {
  it('يرجّع 404 برسالة عربية تشرح المسار', () => {
    const { res, captured } = fakeRes();
    notFoundHandler(
      { method: 'GET', path: '/api/wat' } as never,
      res as never,
    );

    assert.equal(captured.status, 404);
    const body = captured.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.message, /GET \/api\/wat/);
  });

  it('يمرّر رمز ورسالة AppError كما هي', () => {
    const { res, captured } = fakeRes();
    errorHandler(
      new AppError(404, 'NOT_FOUND', 'ما لقينا الملف'),
      {} as never,
      res as never,
      noopNext,
    );

    assert.equal(captured.status, 404);
    const body = captured.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.message, 'ما لقينا الملف');
  });

  it('يرجّع 503 لما تكون أداة اختيارية ناقصة', () => {
    const { res, captured } = fakeRes();
    errorHandler(
      new AppError(503, 'NO_RENDERER', 'ما لقينا متصفح للرسم.'),
      {} as never,
      res as never,
      noopNext,
    );

    assert.equal(captured.status, 503);
    assert.equal((captured.body as { error: { code: string } }).error.code, 'NO_RENDERER');
  });

  it('يخفي تفاصيل الأخطاء غير المتوقعة خلف رسالة عامة', () => {
    const { res, captured } = fakeRes();
    errorHandler(new Error('اتصال قاعدة البيانات انقطع'), {} as never, res as never, noopNext);

    assert.equal(captured.status, 500);
    const body = captured.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'SERVER_ERROR');
    assert.doesNotMatch(body.error.message, /قاعدة البيانات/);
  });

  it('يمرّر الخطأ لـ next لو الترويسات انبعثت', () => {
    let passed: unknown = null;
    const error = new Error('متأخر');
    errorHandler(
      error,
      {} as never,
      { headersSent: true } as never,
      ((err: unknown) => {
        passed = err;
      }) as never,
    );

    assert.equal(passed, error);
  });

  it('يعدّ نقص الأدوات الاختيارية تدهورًا لا عطلًا', () => {
    // هذي الأكواد تنسجّل تنبيهًا لا خطأ، عشان السجل ما يغرق
    // على الأجهزة الخفيفة (الجوال بدون متصفح أو ffmpeg).
    for (const code of ['NO_RENDERER', 'NO_FFMPEG', 'NO_MODEL']) {
      assert.ok(DEGRADED_CODES.has(code), `${code} لازم يكون تدهورًا`);
    }
    assert.ok(!DEGRADED_CODES.has('SERVER_ERROR'));
  });
});
