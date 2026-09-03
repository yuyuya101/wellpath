/**
 * 权益 / 订阅 / 恢复码应用服务（T11）。
 * 订阅 30 天；过期回退免费摘要但不删数据；恢复码 7 天单次。
 */
import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { ProblemError } from '@/server/api/errors';
import type { Db } from '@/server/infrastructure/db/client';
import {
  accessSession,
  entitlement,
  recoveryToken,
  subscription,
} from '@/server/infrastructure/db/schema';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  RECOVERY_TTL_MS,
} from '@/server/domain/recovery';
import { ACCESS_COOKIE, sha256 } from './assessmentService';
import { nowTs, isoTs } from '@/server/infrastructure/db/time';

export const SUBSCRIPTION_DAYS = 30;
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

function problem401() {
  return new ProblemError('RECOVERY_INVALID', 'recovery code is invalid, expired or already used');
}

export interface GrantedPremium {
  subscriptionId: string;
  recoveryCode: string; // 明文，仅本次返回（支付成功页只展示一次）
  premiumExpiresAt: Date;
}

/** 授予 premium：写订阅 + 续期权益 + 生成一次性恢复码（调用方须在幂等保护内） */
export async function grantPremium(
  db: Db,
  sessionId: string,
  productCode: string,
  externalRef?: string,
): Promise<GrantedPremium> {
  const now = new Date();
  const premiumExpiresAt = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);
  const recoveryExpiresAt = new Date(now.getTime() + RECOVERY_TTL_MS);
  const recoveryCode = generateRecoveryCode();

  return db.transaction(async (tx) => {
    const [sub] = await tx
      .insert(subscription)
      .values({
        sessionId,
        status: 'active',
        productCode,
        externalRef,
        startedAt: isoTs(now),
        expiresAt: isoTs(premiumExpiresAt),
      })
      .returning();

    // 唯一 session 权益：已存在则延期
    const [existing] = await tx.select().from(entitlement).where(eq(entitlement.sessionId, sessionId));
    if (existing) {
      const base = existing.expiresAt && existing.expiresAt.getTime() > now.getTime()
        ? existing.expiresAt
        : now;
      await tx
        .update(entitlement)
        .set({
          tier: 'premium',
          source: 'payment',
          startedAt: isoTs(now),
          expiresAt: isoTs(new Date(base.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000)),
        })
        .where(eq(entitlement.sessionId, sessionId));
    } else {
      await tx.insert(entitlement).values({
        sessionId,
        tier: 'premium',
        source: 'payment',
        startedAt: isoTs(now),
        expiresAt: isoTs(premiumExpiresAt),
      });
    }

    await tx.insert(recoveryToken).values({
      sessionId,
      tokenHash: hashRecoveryCode(recoveryCode),
      used: false,
      expiresAt: isoTs(recoveryExpiresAt),
    });

    return {
      subscriptionId: sub!.id,
      recoveryCode,
      premiumExpiresAt,
    };
  });
}

export interface RedeemResult {
  sessionId: string;
  accessToken: string;
  accessCookie: string;
  accessExpiresAt: Date;
}

/** 恢复码兑换：单次、过期/重放/已用 -> 401；成功签发新的 24h 访问令牌 */
export async function redeemRecoveryCode(db: Db, code: string): Promise<RedeemResult> {
  const tokenHash = hashRecoveryCode(code);
  const [token] = await db
    .select()
    .from(recoveryToken)
    .where(and(eq(recoveryToken.tokenHash, tokenHash), gt(recoveryToken.expiresAt, nowTs())));

  if (!token || token.used) {
    throw problem401();
  }

  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
  const accessToken = randomBytes(32).toString('base64url');

  await db.transaction(async (tx) => {
    // 单次：用条件更新兜底并发重放（WHERE used=false）
    const claimed = await tx
      .update(recoveryToken)
      .set({ used: true, consumedAt: isoTs(now) })
      .where(and(eq(recoveryToken.id, token.id), eq(recoveryToken.used, false)))
      .returning();
    if (claimed.length === 0) throw problem401();

    await tx.insert(accessSession).values({
      tokenHash: sha256(accessToken),
      assessmentSessionId: token.sessionId,
      expiresAt: isoTs(accessExpiresAt),
    });
  });

  return {
    sessionId: token.sessionId,
    accessToken,
    accessCookie: ACCESS_COOKIE,
    accessExpiresAt,
  };
}
