import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDbHandle } from '@/server/infrastructure/db/client';
import { createApp, type AppType } from '@/server/api/app';
import { ACCESS_COOKIE } from '@/server/application/assessmentService';
import { subscription, recoveryToken, assessmentResult, assessmentSession, entitlement } from '@/server/infrastructure/db/schema';
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

  it('领域规则违例（目标体重高于当前）-> 422 字段错误而非 500，且不写结果/不置 submitted', async () => {
    const mk = await app.request('/api/assessments', { method: 'POST' });
    const cookie = mk.headers.get('set-cookie')?.split(';')[0] ?? '';
    const { sessionId } = await json(mk);
    const steps: Array<[string, object]> = [
      ['basics', { sex: 'male', ageYears: 21, heightCm: 170, weightKg: 50 }],
      ['goal', { targetWeightKg: 55 }],
      ['activity', { activity: 'moderate' }],
      ['condition', { specialCondition: null }],
    ];
    for (const [stepKey, answer] of steps) {
      await app.request(`/api/assessments/${sessionId}/steps/${stepKey}`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ stepKey, answer }),
      });
    }
    const res = await submit(sessionId, cookie);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors.targetWeightKg).toBeDefined();
    const [result] = await h.db.select().from(assessmentResult).where(eq(assessmentResult.sessionId, sessionId));
    expect(result).toBeUndefined();
    const [s] = await h.db.select().from(assessmentSession).where(eq(assessmentSession.id, sessionId));
    expect(s!.status).toBe('in_progress');
  });
});

describe('T10 结果 DTO 脱敏（会员/非会员边界）', () => {
  it('未支付：免费摘要 + 被锁字段清单 + 升级指引，且保护字段“值”绝不返回', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    const res = await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await json(res);
    // 边界身份显式可见
    expect(body.access).toBe('free');
    expect(body.entitlementTier).toBe('free');
    expect(body.locked).toBe(true);
    // 免费通道根本不存在 payload；免费摘要里也没有任何保护字段的值
    expect(body.payload).toBeUndefined();
    const protectedKeys = ['bmr', 'tdee', 'recommendedIntake', 'activityFactor', 'minSafeFloorApplied'];
    for (const k of protectedKeys) expect(body.freeSummary).not.toHaveProperty(k);
    // 被锁字段“名”清单必须显式回传（引导付费），与真实保护字段一一对应
    const lockedKeys = body.lockedFields.map((f: { key: string }) => f.key);
    for (const k of ['bmr', 'tdee', 'recommendedIntake', 'activityFactor', 'safeFloor']) {
      expect(lockedKeys).toContain(k);
    }
    // 结构化升级指引（公司要求：脱敏同时提示需付费）
    expect(body.upgrade.required).toBe(true);
    expect(body.upgrade.endpoint).toBe('POST /api/pay');
    // 免费概览数值仍在
    expect(body.freeSummary.bmi).toBe(26.1);
  });

  it('支付后：完整结果含保护字段，lockedFields 为空并回传会员到期时间', async () => {
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
    expect(body.entitlementTier).toBe('premium');
    expect(body.locked).toBe(false);
    expect(body.lockedFields).toEqual([]);
    expect(body.entitlementExpiresAt).toBeTruthy();
    expect(body.payload.result.tdee).toBe(2726);
    expect(body.payload.result.recommendedIntake).toBe(2226);
  });

  it('会员过期（expiresAt 已过）-> 自动回退免费脱敏，不再返回完整 payload', async () => {
    const { sessionId, cookie } = await fullSteps();
    await submit(sessionId, cookie);
    await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
    });
    // 会员期内应为 full
    const before = await json(await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } }));
    expect(before.access).toBe('full');
    // 把权益到期时间拨到过去，模拟 30 天订阅过期（数据不删，仅回退免费）
    await h.db.update(entitlement).set({ expiresAt: new Date(Date.now() - 1000) });
    const after = await json(await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } }));
    expect(after.access).toBe('free');
    expect(after.entitlementTier).toBe('free');
    expect(after.payload).toBeUndefined();
    expect(after.lockedFields.length).toBeGreaterThan(0);
    expect(after.freeSummary.bmi).toBe(26.1); // 结果数据仍在，只是重新脱敏
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

/** 以自定义四步答案创建并填完，返回 {sessionId,cookie}（未提交） */
async function fillSteps(steps: Array<[string, object]>) {
  const mk = await app.request('/api/assessments', { method: 'POST' });
  const setCookie = mk.headers.get('set-cookie') ?? '';
  const token = setCookie.match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`))?.[1];
  const { sessionId } = (await json(mk)) as { sessionId: string };
  const cookie = `${ACCESS_COOKIE}=${token}`;
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

async function payOnce(sessionId: string, cookie: string) {
  return app.request('/api/pay', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
  });
}

describe('T17 双目标：增重 / 维持 端到端', () => {
  it('增重：免费摘要方向=surplus 且无保护值；支付后完整结果为 TDEE+350 并带个性化建议', async () => {
    const { sessionId, cookie } = await fillSteps([
      ['basics', { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 60, bodyBuild: 'slim' }],
      ['goal', { goal: 'gain', targetWeightKg: 68, pace: 'moderate' }],
      ['activity', { activity: 'light', dailyMovement: 'desk', workoutPreferences: ['strength'] }],
      ['condition', { specialCondition: null, weightTendency: 'hard_to_gain', focusAreas: ['nutrition'] }],
    ]);
    await submit(sessionId, cookie);

    const free = await json(await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } }));
    expect(free.access).toBe('free');
    expect(free.freeSummary.goal).toBe('gain');
    expect(free.freeSummary.energyDirection).toBe('surplus');
    // 免费通道物理上不含任何保护值
    expect(free.payload).toBeUndefined();
    for (const k of ['bmr', 'tdee', 'recommendedIntake']) expect(free.freeSummary).not.toHaveProperty(k);

    await payOnce(sessionId, cookie);
    const full = await json(await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } }));
    expect(full.access).toBe('full');
    expect(full.payload.result.energyDirection).toBe('surplus');
    expect(full.payload.result.energyAdjustment).toBe(350);
    expect(full.payload.result.tdee).toBe(2143);
    expect(full.payload.result.recommendedIntake).toBe(2493); // 2143 + 350
    expect(full.payload.result.targetDateRangeWeeks).toEqual({ fastestWeeks: 16, steadyWeeks: 32 });
    // 会员专属画像与确定性建议
    expect(full.payload.profile.workoutPreferences).toEqual(['strength']);
    expect(Array.isArray(full.payload.recommendations)).toBe(true);
    expect(full.payload.recommendations.length).toBeGreaterThan(0);
  });

  it('维持：目标=当前，方向 maintenance、摄入=TDEE、无时间线', async () => {
    const { sessionId, cookie } = await fillSteps([
      ['basics', { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 70 }],
      ['goal', { goal: 'maintain', targetWeightKg: 70, pace: 'moderate' }],
      ['activity', { activity: 'light' }],
      ['condition', { specialCondition: null }],
    ]);
    await submit(sessionId, cookie);
    await payOnce(sessionId, cookie);
    const full = await json(await app.request(`/api/assessments/${sessionId}/result`, { headers: { cookie } }));
    expect(full.payload.result.energyDirection).toBe('maintenance');
    expect(full.payload.result.energyAdjustment).toBe(0);
    expect(full.payload.result.tdee).toBe(2281);
    expect(full.payload.result.recommendedIntake).toBe(2281);
    expect(full.payload.result.targetDateRangeWeeks).toBeNull();
  });

  it('增重目标超过 BMI25 健康上限 -> submit 422 字段错误，不写结果', async () => {
    const { sessionId, cookie } = await fillSteps([
      ['basics', { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 60 }],
      ['goal', { goal: 'gain', targetWeightKg: 80, pace: 'moderate' }], // 175 上限 76.56
      ['activity', { activity: 'light' }],
      ['condition', { specialCondition: null }],
    ]);
    const res = await submit(sessionId, cookie);
    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.fieldErrors.targetWeightKg).toBeDefined();
    const [row] = await h.db.select().from(assessmentResult).where(eq(assessmentResult.sessionId, sessionId));
    expect(row).toBeUndefined();
  });
});
