import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDbHandle } from '@/server/infrastructure/db/client';
import { createApp, type AppType } from '@/server/api/app';
import { ACCESS_COOKIE } from '@/server/application/assessmentService';
import { subscription, recoveryToken, assessmentResult, assessmentSession } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';

let h: TestDbHandle;
let app: AppType;

beforeAll(() => {
  process.env.RECOVERY_HMAC_KEY = 'test-hmac-key-for-vitest-only-0123456789';
});
beforeEach(async () => {
  h = await createTestDb();
  app = createApp({ db: h.db });
});
afterEach(async () => h.close());

async function json(res: Response) {
  return res.json();
}

/** 创建并填完四步（附录样例1），返回 {sessionId,cookie}；未提交 */
async function fullSteps() {
  const mk = await app.request('/api/assessments', { method: 'POST' });
  const setCookie = mk.headers.get('set-cookie') ?? '';
  const token = setCookie.match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`))?.[1];
  const { sessionId } = (await json(mk)) as { sessionId: string };
  const cookie = `${ACCESS_COOKIE}=${token}`;
  const steps: Array<[string, object]> = [
    ['basics', { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80 }],
    ['goal', { targetWeightKg: 70 }],
    ['activity', { activity: 'moderate' }],
    ['condition', { specialCondition: null }],
  ];
  for (const [stepKey, answer] of steps) {
    const res = await app.request(`/api/assessments/${sessionId}/steps/${stepKey}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey, answer }),
    });
    expect(res.status).toBe(200);
  }
  return { sessionId, cookie };
}

async function submit(sessionId: string, cookie: string) {
  return app.request(`/api/assessments/${sessionId}/submit`, { method: 'POST', headers: { cookie } });
}

describe('T09 提交事务', () => {
  it('缺步提交 -> 422，整体回滚（无结果、仍 in_progress）', async () => {
    const mk = await app.request('/api/assessments', { method: 'POST' });
    const cookie = mk.headers.get('set-cookie')?.split(';')[0] ?? '';
    const { sessionId } = await json(mk);
    // 只填一步
    await app.request(`/api/assessments/${sessionId}/steps/basics`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'basics', answer: { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80 } }),
    });
    const res = await submit(sessionId, cookie);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.fieldErrors.missingSteps).toContain('goal');
    const [result] = await h.db.select().from(assessmentResult).where(eq(assessmentResult.sessionId, sessionId));
    expect(result).toBeUndefined();
    const [s] = await h.db.select().from(assessmentSession).where(eq(assessmentSession.id, sessionId));
    expect(s!.status).toBe('in_progress');
  });

  it('完整提交成功且重复提交不重算', async () => {
    const { sessionId, cookie } = await fullSteps();
    const first = await submit(sessionId, cookie);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ recomputed: true, kind: 'complete' });
    const second = await submit(sessionId, cookie);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ recomputed: false });
  });
});

describe('T10 结果 DTO 脱敏', () => {
  it('未支付：免费摘要且不含保护字段键', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const res = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.access).toBe('free');
    expect(body.locked).toBe(true);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('bmr');
    expect(serialized).not.toContain('tdee');
    expect(serialized).not.toContain('recommendedIntake');
    expect(body.freeSummary.bmi).toBe(26.1);
  });

  it('支付后：完整结果含保护字段', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const payRes = await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
    });
    expect(payRes.status).toBe(200);
    const res = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    const body = await json(res);
    expect(body.access).toBe('full');
    expect(body.payload.result.tdee).toBe(2726);
    expect(body.payload.result.recommendedIntake).toBe(2226);
  });
});

describe('T11 恢复码', () => {
  it('单次使用，重放第二次失效', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const payRes = await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'p' }),
    });
    const { recoveryCode } = await json(payRes);
    expect(recoveryCode).toBeTruthy();

    const first = await app.request('/api/recovery/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryCode }),
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('set-cookie')).toContain(ACCESS_COOKIE);

    const replay = await app.request('/api/recovery/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryCode }),
    });
    expect(replay.status).toBe(401);
    expect((await json(replay)).code).toBe('RECOVERY_INVALID');
  });

  it('过期恢复码失效', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const payRes = await app.request('/api/pay', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'p' }),
    });
    const { recoveryCode } = await json(payRes);
    await h.db.update(recoveryToken).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await app.request('/api/recovery/redeem', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryCode }),
    });
    expect(res.status).toBe(401);
  });
});

describe('T12 支付幂等', () => {
  it('同键双击只授予一次权益，重放不回显恢复码', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const key = randomUUID();
    const body = JSON.stringify({ sessionId, idempotencyKey: key, productCode: 'p' });
    const r1 = await app.request('/api/pay', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body });
    const b1 = await json(r1);
    expect(b1.status).toBe('succeeded');
    expect(b1.replayed).toBe(false);
    expect(b1.recoveryCode).toBeTruthy();

    const r2 = await app.request('/api/pay', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body });
    const b2 = await json(r2);
    expect(b2.replayed).toBe(true);
    expect(b2.recoveryCode).toBeNull();

    const subs = await h.db.select().from(subscription).where(eq(subscription.sessionId, sessionId));
    expect(subs).toHaveLength(1);
  });

  it('同键异参 -> 409 PAYMENT_IDEMPOTENT_MISMATCH', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const key = randomUUID();
    await app.request('/api/pay', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: key, productCode: 'A' }),
    });
    const conflict = await app.request('/api/pay', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: key, productCode: 'B' }),
    });
    expect(conflict.status).toBe(409);
    expect((await json(conflict)).code).toBe('PAYMENT_IDEMPOTENT_MISMATCH');
  });

  it('simulate=fail 走失败分支且不授予权益', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const res = await app.request('/api/pay', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'p', simulate: 'fail' }),
    });
    expect(res.status).toBe(422);
    expect((await json(res)).status).toBe('failed');
    const subs = await h.db.select().from(subscription).where(eq(subscription.sessionId, sessionId));
    expect(subs).toHaveLength(0);
  });
});

describe('T13 DB 固定窗口限流', () => {
  it('创建会话第 11 次 -> 429（阈值 10/min）', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await app.request('/api/assessments', { method: 'POST' });
    }
    expect(last!.status).toBe(429);
    expect((await json(last!)).code).toBe('RATE_LIMITED');
  }, 30000);
});

describe('T16 修改重算', () => {
  it('改活动水平后 recalculate 覆盖结果；普通重复提交不重算；权益保留', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);

    // 首次结果 moderate -> TDEE 2726
    let r = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    let body = await json(r);
    // 免费看不到 tdee，先支付
    await app.request('/api/pay', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'p' }),
    });
    r = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    body = await json(r);
    expect(body.payload.result.tdee).toBe(2726);

    // 修改 activity: moderate -> sedentary（带 revision=1）
    const patch = await app.request(`/api/assessments/${sessionId}/steps/activity`, {
      method: 'PATCH', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'activity', answer: { activity: 'sedentary' }, expectedRevision: 1 }),
    });
    expect(patch.status).toBe(200);

    // 不带 recalculate 的重复提交 -> 不重算
    const dup = await submit(sessionId, cookie);
    expect((await json(dup)).recomputed).toBe(false);

    // 带 recalculate=true -> 重算
    const recalc = await app.request(`/api/assessments/${sessionId}/submit`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ recalculate: true }),
    });
    expect(recalc.status).toBe(200);
    expect(await json(recalc)).toMatchObject({ recomputed: true });

    // 结果更新：sedentary TDEE = round(1758.75*1.2)=2111；且权益仍 premium
    r = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    body = await json(r);
    expect(body.access).toBe('full');
    expect(body.payload.result.activityFactor).toBe(1.2);
    expect(body.payload.result.tdee).toBe(2111);
  });
});
