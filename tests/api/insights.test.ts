import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, type TestDbHandle } from '@/server/infrastructure/db/client';
import { createApp, type AppType } from '@/server/api/app';
import { ACCESS_COOKIE } from '@/server/application/assessmentService';

let h: TestDbHandle;
let app: AppType;
const realFetch = globalThis.fetch;

beforeAll(() => {
  process.env.RECOVERY_HMAC_KEY = 'test-hmac-key-for-vitest-only-0123456789';
});
beforeEach(async () => {
  h = await createTestDb();
  app = createApp({ db: h.db });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  globalThis.fetch = realFetch;
  await h.close();
});

async function submittedSession() {
  const mk = await app.request('/api/assessments', { method: 'POST' });
  const token = (mk.headers.get('set-cookie') ?? '').match(new RegExp(`${ACCESS_COOKIE}=([^;]+)`))?.[1];
  const { sessionId } = await mk.json();
  const cookie = `${ACCESS_COOKIE}=${token}`;
  const steps: Array<[string, object]> = [
    ['basics', { sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80 }],
    ['goal', { targetWeightKg: 70 }],
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
  await app.request(`/api/assessments/${sessionId}/submit`, { method: 'POST', headers: { cookie } });
  return { sessionId, cookie };
}

function stubOllama(response: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown) => {
    if (String(url).includes('11434')) {
      if (response instanceof Error) throw response;
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url as Parameters<typeof realFetch>[0]);
  }) as typeof fetch);
}

describe('T24 会员专属 AI 洞察', () => {
  it('非会员调用 -> 402 PAYMENT_REQUIRED（AI 教练是付费功能，边界拦截）', async () => {
    const { sessionId, cookie } = await submittedSession();
    // 已提交但刻意不支付，验证会员边界拦截
    const res = await app.request(`/api/assessments/${sessionId}/insights`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe('PAYMENT_REQUIRED');
  });

  it('会员 + 本地模型不可达 -> 200 且回退确定性建议（source=rule-fallback），功能不硬失败', async () => {
    const { sessionId, cookie } = await submittedSession();
    await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
    });
    stubOllama(new Error('ECONNREFUSED 127.0.0.1:11434'));
    const res = await app.request(`/api/assessments/${sessionId}/insights`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access).toBe('full');
    expect(body.source).toBe('rule-fallback');
    expect(Array.isArray(body.tips)).toBe(true);
    expect(body.tips.length).toBeGreaterThan(0);
  });

  it('会员 + 本地 DeepSeek/Ollama 正常 -> 200 source=local-llm，模型输出被拆成建议条目', async () => {
    const { sessionId, cookie } = await submittedSession();
    await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
    });
    stubOllama({
      model: 'deepseek-r1:1.5b',
      response: '- Eat 2226 kcal per day with protein at each meal.\n- Walk 8k steps and lift twice a week.\n- Weigh in weekly, not daily.',
    });
    const res = await app.request(`/api/assessments/${sessionId}/insights`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('local-llm');
    expect(body.model).toBe('deepseek-r1:1.5b');
    expect(body.tips).toHaveLength(3);
    expect(body.tips[0]).toContain('2226');
  });

  it('production 且未配置 OLLAMA_BASE_URL -> 直接 rule-fallback，且不向本地模型发请求（线上不空等超时）', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.OLLAMA_BASE_URL;
    const { sessionId, cookie } = await submittedSession();
    await app.request('/api/pay', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, idempotencyKey: randomUUID(), productCode: 'wellpath_premium_30d' }),
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((async () => new Response(JSON.stringify({ response: 'SHOULD NOT BE USED' }), { status: 200 })) as typeof fetch);

    const res = await app.request(`/api/assessments/${sessionId}/insights`, { method: 'POST', headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('rule-fallback');
    expect(body.tips.length).toBeGreaterThan(0);
    // Hono app.request 不走全局 fetch；因此这里若有调用，只能是打向本地模型——必须为 0
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
