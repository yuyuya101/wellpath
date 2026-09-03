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

  // 创建会话
  r.post('/assessments', async (c) => {
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
    const session = await getSession(c.var.db, id); // 先判资源存在性 -> 404
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, id, token);
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

    const token = getCookie(c, ACCESS_COOKIE);
    await getSession(c.var.db, id); // 先判资源存在性 -> 404
    await assertAccess(c.var.db, id, token);

    const result = await upsertStep(
      c.var.db,
      id,
      body.stepKey,
      body.answer,
      body.expectedRevision,
    );
    return c.json(result, 200);
  });

  return r;
}
