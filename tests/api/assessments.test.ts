import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDbHandle } from '@/server/infrastructure/db/client';
import { createApp, type AppType } from '@/server/api/app';
import { ACCESS_COOKIE } from '@/server/application/assessmentService';

let h: TestDbHandle;
let app: AppType;

beforeEach(async () => {
  h = await createTestDb();
  app = createApp({ db: h.db });
});
afterEach(async () => h.close());

async function createSession() {
  const res = await app.request('/api/assessments', { method: 'POST' });
  expect(res.status).toBe(201);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = setCookie.match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`))?.[1];
  const body = (await res.json()) as { sessionId: string };
  return { sessionId: body.sessionId, cookie: `${ACCESS_COOKIE}=${token}` };
}

describe('T06 /health', () => {
  it('返回 200 与 db=up', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('T07 会话创建与恢复', () => {
  it('POST 创建会话并下发 HttpOnly cookie', async () => {
    const res = await app.request('/api/assessments', { method: 'POST' });
    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('GET 带 cookie 恢复，初始无步骤', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('in_progress');
    expect(body.steps).toEqual([]);
  });

  it('GET 无 cookie -> 400 problem+json', async () => {
    const { sessionId } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}`);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('GET 不存在会话 -> 404', async () => {
    const { cookie } = await createSession();
    const res = await app.request('/api/assessments/00000000-0000-0000-0000-000000000000', {
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });
});

describe('T08 分步保存与乐观锁', () => {
  it('首次写入 revision=1，正确更新到 revision=2', async () => {
    const { sessionId, cookie } = await createSession();
    const url = `/api/assessments/${sessionId}/steps/basics`;

    const first = await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'basics', answer: { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80 } }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ revision: 1 });

    const second = await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        stepKey: 'basics',
        answer: { sex: 'male', ageYears: 29, heightCm: 175, weightKg: 80 },
        expectedRevision: 1,
      }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ revision: 2 });
  });

  it('过期基版本 -> 409 STEP_CONFLICT 并回带当前 revision', async () => {
    const { sessionId, cookie } = await createSession();
    const url = `/api/assessments/${sessionId}/steps/goal`;
    await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'goal', answer: { targetWeightKg: 70 } }),
    });
    // 已到 revision 1，客户端仍声称 expectedRevision=1 更新到 2（合法）
    const ok = await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        stepKey: 'goal',
        answer: { targetWeightKg: 69 },
        expectedRevision: 1,
      }),
    });
    expect(ok.status).toBe(200);
    // 另一客户端仍用过期的 1 -> 409
    const stale = await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        stepKey: 'goal',
        answer: { targetWeightKg: 68 },
        expectedRevision: 1,
      }),
    });
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.code).toBe('STEP_CONFLICT');
    expect(body.fieldErrors.currentRevision).toEqual(['2']);
  });

  it('更新缺 expectedRevision -> 409', async () => {
    const { sessionId, cookie } = await createSession();
    const url = `/api/assessments/${sessionId}/steps/activity`;
    await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'activity', answer: { activity: 'light' } }),
    });
    const res = await app.request(url, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'activity', answer: { activity: 'moderate' } }),
    });
    expect(res.status).toBe(409);
  });

  it('非法 body -> 422 VALIDATION_FAILED + fieldErrors', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}/steps/basics`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'basics', answer: 'bad' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors.answer).toBeTruthy();
  });

  it('path/body stepKey 不一致 -> 422', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}/steps/basics`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'goal', answer: {} }),
    });
    expect(res.status).toBe(422);
  });

  it('单步强校验：activity 传空枚举 -> 422 且带字段错误（脏数据不落库）', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}/steps/activity`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'activity', answer: { activity: '' } }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors.activity).toBeTruthy();
    // 被拒绝后该步骤不应存在：恢复时 steps 仍为空
    const check = await app.request(`/api/assessments/${sessionId}`, { headers: { cookie } });
    expect((await check.json()).steps).toEqual([]);
  });

  it('单步强校验：已提供但非法（数字传字符串）-> 422 且不落库', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}/steps/basics`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        stepKey: 'basics',
        answer: { sex: 'male', ageYears: '28', heightCm: 175, weightKg: 'bad' }, // age/weight 为非法字符串
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.fieldErrors.ageYears).toBeTruthy();
    expect(body.fieldErrors.weightKg).toBeTruthy();
    // 被拒绝后该步骤不存在：恢复时 steps 仍为空
    const check = await app.request(`/api/assessments/${sessionId}`, { headers: { cookie } });
    expect((await check.json()).steps).toEqual([]);
  });

  it('分屏草稿：只提交某一步的部分合法字段 -> 200（完整性留到 submit 裁决）', async () => {
    const { sessionId, cookie } = await createSession();
    const res = await app.request(`/api/assessments/${sessionId}/steps/basics`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ stepKey: 'basics', answer: { sex: 'male', heightCm: 175 } }),
    });
    expect(res.status).toBe(200);
    const check = await app.request(`/api/assessments/${sessionId}`, { headers: { cookie } });
    const steps = (await check.json()).steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].answer).toMatchObject({ sex: 'male', heightCm: 175 });
  });
});
