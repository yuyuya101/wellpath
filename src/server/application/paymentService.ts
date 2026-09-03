/**
 * 支付应用服务（T12）：无 pending 的两态状态机 succeeded/failed。
 * Idempotency-Key 永久去重：同键重放返回首次结果，同键异参 409；
 * 依赖 payment_event 唯一约束兜底并发双击（只授予一次权益）。
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import { assessmentSession, paymentEvent } from '@/server/infrastructure/db/schema';
import { ProblemError } from '@/server/api/errors';
import { grantPremium, type GrantedPremium } from './entitlementService';

export interface PayCommand {
  sessionId: string;
  idempotencyKey: string; // UUIDv4
  productCode: string;
  simulate?: 'fail';
  env?: string;
}

export type PayResult =
  | ({ status: 'succeeded'; replayed: boolean } & GrantedPremium)
  | { status: 'failed'; replayed: boolean; reason: string };

interface Fingerprint {
  sessionId: string;
  productCode: string;
}

function sameFingerprint(a: unknown, b: Fingerprint): boolean {
  const f = a as Fingerprint;
  return !!f && f.sessionId === b.sessionId && f.productCode === b.productCode;
}

export async function pay(db: Db, cmd: PayCommand): Promise<PayResult> {
  const [session] = await db
    .select()
    .from(assessmentSession)
    .where(eq(assessmentSession.id, cmd.sessionId));
  if (!session || session.status === 'deleted') {
    throw new ProblemError('SESSION_NOT_FOUND', 'session not found');
  }
  if (session.status !== 'submitted') {
    throw new ProblemError('INVALID_REQUEST', 'assessment must be submitted before payment');
  }
  if (cmd.simulate === 'fail' && cmd.env === 'production') {
    throw new ProblemError('INVALID_REQUEST', 'simulate is disabled in production');
  }

  const fingerprint: Fingerprint = { sessionId: cmd.sessionId, productCode: cmd.productCode };

  // 已有同键事件 -> 重放或异参冲突
  const [prior] = await db
    .select()
    .from(paymentEvent)
    .where(eq(paymentEvent.idempotencyKey, cmd.idempotencyKey));
  if (prior) {
    if (!sameFingerprint(prior.fingerprint, fingerprint)) {
      throw new ProblemError(
        'PAYMENT_IDEMPOTENT_MISMATCH',
        'idempotency key was already used with a different payload',
      );
    }
    if (prior.status === 'failed') {
      return { status: 'failed', replayed: true, reason: 'previous attempt failed' };
    }
    // 成功重放：不再授予权益，不回显恢复码（恢复码只在首次成功展示一次）
    return {
      status: 'succeeded',
      replayed: true,
      subscriptionId: '',
      recoveryCode: '',
      premiumExpiresAt: new Date(0),
    };
  }

  const willFail = cmd.simulate === 'fail';

  // 插入支付事件；唯一约束兜底并发双击
  try {
    await db.insert(paymentEvent).values({
      idempotencyKey: cmd.idempotencyKey,
      sessionId: cmd.sessionId,
      eventType: 'checkout',
      status: willFail ? 'failed' : 'succeeded',
      fingerprint: fingerprint as unknown as Record<string, unknown>,
    });
  } catch {
    // 并发：另一请求已插入同键 -> 走重放判定
    const [winner] = await db
      .select()
      .from(paymentEvent)
      .where(eq(paymentEvent.idempotencyKey, cmd.idempotencyKey));
    if (!winner) throw new ProblemError('INTERNAL_ERROR', 'payment race unresolved');
    if (!sameFingerprint(winner.fingerprint, fingerprint)) {
      throw new ProblemError('PAYMENT_IDEMPOTENT_MISMATCH', 'concurrent key reuse mismatch');
    }
    return {
      status: winner.status === 'failed' ? 'failed' : 'succeeded',
      replayed: true,
      reason: 'concurrent duplicate',
      ...(winner.status === 'succeeded'
        ? { subscriptionId: '', recoveryCode: '', premiumExpiresAt: new Date(0) }
        : {}),
    } as PayResult;
  }

  if (willFail) {
    return { status: 'failed', replayed: false, reason: 'simulated failure' };
  }

  const granted = await grantPremium(db, cmd.sessionId, cmd.productCode, cmd.idempotencyKey);
  return { status: 'succeeded', replayed: false, ...granted };
}
