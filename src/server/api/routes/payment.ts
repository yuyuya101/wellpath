import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '@/server/api/app';
import { ProblemError } from '@/server/api/errors';
import { ACCESS_COOKIE, assertAccess } from '@/server/application/assessmentService';
import { pay } from '@/server/application/paymentService';
import { redeemRecoveryCode } from '@/server/application/entitlementService';
import { clientSubject, consume } from '@/server/application/rateLimitService';
import { flattenZodError, payBodySchema, redeemBodySchema } from '@/server/validation/schemas';

export function paymentRoutes() {
  const r = new Hono<AppEnv>();

  // 模拟支付（幂等 + 限流 5/min/IP）
  r.post('/pay', async (c) => {
    await consume(c.var.db, 'pay', clientSubject(c.req.raw.headers));

    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ProblemError('INVALID_REQUEST', 'request body is not valid JSON');
    }
    const parsed = payBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProblemError(
        'VALIDATION_FAILED',
        'payment body failed validation',
        flattenZodError(parsed.error),
      );
    }
    const body = parsed.data;
    const token = getCookie(c, ACCESS_COOKIE);
    await assertAccess(c.var.db, body.sessionId, token);

    const result = await pay(c.var.db, {
      sessionId: body.sessionId,
      idempotencyKey: body.idempotencyKey,
      productCode: body.productCode,
      simulate: body.simulate,
      env: process.env.NODE_ENV,
    });

    if (result.status === 'failed') {
      return c.json(
        { status: 'failed', replayed: result.replayed, reason: result.reason },
        422,
      );
    }
    return c.json({
      status: 'succeeded',
      replayed: result.replayed,
      // 恢复码仅在首次成功返回（重放为空串），前端只展示一次
      recoveryCode: result.recoveryCode || null,
      premiumExpiresAt:
        result.premiumExpiresAt.getTime() > 0 ? result.premiumExpiresAt.toISOString() : null,
    });
  });

  // 恢复码兑换（换设备/丢失访问后恢复，签发新 cookie）
  r.post('/recovery/redeem', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new ProblemError('INVALID_REQUEST', 'request body is not valid JSON');
    }
    const parsed = redeemBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProblemError(
        'VALIDATION_FAILED',
        'recovery body failed validation',
        flattenZodError(parsed.error),
      );
    }
    const result = await redeemRecoveryCode(c.var.db, parsed.data.recoveryCode);
    setCookie(c, ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });
    return c.json({
      sessionId: result.sessionId,
      accessExpiresAt: result.accessExpiresAt.toISOString(),
    });
  });

  return r;
}
