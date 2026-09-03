/**
 * DB 固定窗口限流（T13）：计数落 rate_counter，无内存计数（多实例一致）。
 * 窗口按分钟对齐；超限抛 429。
 */
import { sql } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import { rateCounter, type RateScope } from '@/server/infrastructure/db/schema';
import { ProblemError } from '@/server/api/errors';

export const RATE_LIMITS: Record<RateScope, number> = {
  create_session: Number(process.env.RATE_LIMIT_SESSION_RPM ?? 10),
  pay: Number(process.env.RATE_LIMIT_PAY_RPM ?? 5),
};

function minuteWindow(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), 0, 0));
}

/** 消耗一次额度，返回窗口内已用次数；超过 limit 抛 429 */
export async function consume(
  db: Db,
  scope: RateScope,
  subject: string,
  now = new Date(),
): Promise<number> {
  const limit = RATE_LIMITS[scope];
  const windowStart = minuteWindow(now);

  // upsert：存在则 count+1
  await db
    .insert(rateCounter)
    .values({ scope, subject, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateCounter.scope, rateCounter.subject, rateCounter.windowStart],
      set: { count: sql`${rateCounter.count} + 1` },
    });

  const [row] = await db
    .select()
    .from(rateCounter)
    .where(
      sql`${rateCounter.scope} = ${scope} AND ${rateCounter.subject} = ${subject}
          AND ${rateCounter.windowStart} = ${windowStart}`,
    );
  const used = row?.count ?? 0;
  if (used > limit) {
    throw new ProblemError('RATE_LIMITED', `limit ${limit}/min exceeded for ${scope}`, {
      limit: [String(limit)],
      retryAfterSeconds: ['60'],
    });
  }
  return used;
}

/** 取客户端主体（穿透 Render 代理后的真实 IP） */
export function clientSubject(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
