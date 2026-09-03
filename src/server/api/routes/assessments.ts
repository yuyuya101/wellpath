import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '@/server/api/app';
import { ProblemError } from '@/server/api/errors';
import {
  ACCESS_COOKIE,
  assertAccess,
  createSession,
  getSession,
  listSteps,
  upsertStep,
} from '@/server/application/assessmentService';
import { getResultView, submitAssessment } from '@/server/application/resultService';
import { clientSubject, consume } from '@/server/application/rateLimitService';
import { assessmentSession } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import {
  flattenZodError,
  patchStepBodySchema,
  stepKeySchema,
} from '@/server/validation/schemas';

const uuidParam = z.uuid();

function parseId(value: string): string {
  const r = uuidParam.safeParse(value);
  if (!r.success) throw new ProblemError('INVALID_REQUEST', 'malformed session id');
  return value;
}

export function assessmentsRoutes() {
  const r = new Hono<AppEnv>();

  // 创建会话（固定窗口限流 10/min/IP）
  r.post('/assessments', async (c) => {
    await consume(c.var.db, 'create_session', clientSubject(c.req.raw.headers));
    const created = await createSession(c.var.db);
    setCookie(c, ACCESS_COOKIE, created.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    return c.json(
      {
        sessionId: created.sessionId,
        status: 'in_progress',
        accessExpiresAt: created.accessExpiresAt.toISOString(),
      },
      201,
    );
  });

  // 恢复进度
  r.get('/assessments/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    await getSession(c.var.db, id);
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);
    const session = await getSession(c.var.db, id);
    const steps = await listSteps(c.var.db, id);
    return c.json({
      sessionId: session.id,
      status: session.status,
      steps: steps.map((s) => ({ stepKey: s.stepKey, answer: s.answer, revision: s.revision })),
    });
  });

  // 分步保存（乐观锁）
  r.patch('/assessments/:id/steps/:stepKey', async (c) => {
    const id = parseId(c.req.param('id'));
    const stepKeyResult = stepKeySchema.safeParse(c.req.param('stepKey'));
    if (!stepKeyResult.success) {
      throw new ProblemError('VALIDATION_FAILED', 'unknown stepKey', {
        stepKey: ['must be one of the defined steps'],
      });
    }

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ProblemError('INVALID_REQUEST', 'request body is not valid JSON');
    }
    const parsed = patchStepBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProblemError(
        'VALIDATION_FAILED',
        'request body failed validation',
        flattenZodError(parsed.error),
      );
    }
    const body = parsed.data;
    if (body.stepKey !== c.req.param('stepKey')) {
      throw new ProblemError('VALIDATION_FAILED', 'stepKey in body and path must match');
    }

    await getSession(c.var.db, id);
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);

    const result = await upsertStep(c.var.db, id, body.stepKey, body.answer, body.expectedRevision);
    return c.json(result, 200);
  });

  // 提交（原子事务；重复提交不重算）
  r.post('/assessments/:id/submit', async (c) => {
    const id = parseId(c.req.param('id'));
    await getSession(c.var.db, id);
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);
    const outcome = await submitAssessment(c.var.db, id);
    return c.json(outcome, 200);
  });

  // 结果（按权益字段级脱敏）
  r.get('/assessments/:id/result', async (c) => {
    const id = parseId(c.req.param('id'));
    await getSession(c.var.db, id);
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);
    const view = await getResultView(c.var.db, id);
    return c.json({ sessionId: id, ...view }, 200);
  });

  // 硬删除（级联）
  r.delete('/assessments/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);
    await c.var.db.delete(assessmentSession).where(eq(assessmentSession.id, id));
    c.header('Clear-Cookie', `${ACCESS_COOKIE}=; Path=/; Max-Age=0`);
    return c.json({ deleted: true }, 200);
  });

  return r;
}
