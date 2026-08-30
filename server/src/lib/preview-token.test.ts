import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  PREVIEW_TOKEN_TTL_SEC,
  createPreviewToken,
  verifyPreviewToken,
} from './preview-token.js';

describe('رمز المعاينة', () => {
  it('يقبل رمزًا صحيحًا لمشروعه', () => {
    const token = createPreviewToken('project-a');
    assert.equal(verifyPreviewToken(token, 'project-a'), true);
  });

  it('يرفض الرمز على مشروع ثاني', () => {
    const token = createPreviewToken('project-a');
    assert.equal(verifyPreviewToken(token, 'project-b'), false);
  });

  it('يرفض الرمز بعد ما ينتهي', () => {
    const now = Date.now();
    const token = createPreviewToken('project-a', now);
    const afterExpiry = now + PREVIEW_TOKEN_TTL_SEC * 1000 + 1;
    assert.equal(verifyPreviewToken(token, 'project-a', afterExpiry), false);
  });

  it('يقبل الرمز قبل انتهائه بلحظة', () => {
    const now = Date.now();
    const token = createPreviewToken('project-a', now);
    const justBefore = now + PREVIEW_TOKEN_TTL_SEC * 1000 - 1;
    assert.equal(verifyPreviewToken(token, 'project-a', justBefore), true);
  });

  it('يرفض توقيعًا مزوّرًا حتى لو التاريخ سليم', () => {
    const token = createPreviewToken('project-a');
    const expiry = token.slice(0, token.indexOf('.'));
    assert.equal(verifyPreviewToken(`${expiry}.AAAAAAAA`, 'project-a'), false);
  });

  it('يرفض تمديد الصلاحية بتغيير التاريخ', () => {
    const token = createPreviewToken('project-a');
    const signature = token.slice(token.indexOf('.') + 1);
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    assert.equal(verifyPreviewToken(`${farFuture}.${signature}`, 'project-a'), false);
  });

  it('يرفض الصيغ المشوّهة بدون ما ينهار', () => {
    for (const bad of ['', '.', 'abc', '.sig', 'NaN.sig', '123', `${Date.now() + 1000}`]) {
      assert.equal(verifyPreviewToken(bad, 'project-a'), false, `قبل رمزًا مشوّهًا: ${bad}`);
    }
  });

  it('يعطي رموزًا مختلفة لمشاريع مختلفة', () => {
    const now = Date.now();
    assert.notEqual(createPreviewToken('a', now), createPreviewToken('b', now));
  });
});
