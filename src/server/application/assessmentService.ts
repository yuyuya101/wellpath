/**
 * 测评应用服务（application 层）：编排会话/分步读写，不含 HTTP 细节。
 * 乐观锁、访问会话、免费权益初始化均在此。
 */
import { randomBytes, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import {
  accessSession,
  assessmentSession,
  assessmentStep,
  entitlement,
} from '@/server/infrastructure/db/schema';
import { ProblemError } from '@/server/api/errors';
import { nowTs, isoTs } from '@/server/infrastructure/db/time';
import type { StepKey } from '@/server/validation/schemas';

export const ACCESS_COOKIE = 'wellpath_sid';
const ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreatedSession {
  sessionId: string;
  accessToken: string;
  accessExpiresAt: Date;
}

/** 创建会话：同时初始化免费权益与 24h 访问会话 */
export async function createSession(db: Db): Promise<CreatedSession> {
  const [s] = await db.insert(assessmentSession).values({}).returning();
  if (!s) throw new ProblemError('INTERNAL_ERROR', 'failed to create session');

  await db.insert(entitlement).values({ sessionId: s.id, tier: 'free', source: 'assessment' });

  const accessToken = newToken();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  await db.insert(accessSession).values({
    tokenHash: sha256(accessToken),
    assessmentSessionId: s.id,
    expiresAt: isoTs(accessExpiresAt),
  });

  return { sessionId: s.id, accessToken, accessExpiresAt };
}

/** 取会话，不存在/已删除 -> 404 */
export async function getSession(db: Db, sessionId: string) {
  const [s] = await db.select().from(assessmentSession).where(eq(assessmentSession.id, sessionId));
  if (!s || s.status === 'deleted') {
    throw new ProblemError('SESSION_NOT_FOUND', `session ${sessionId} not found`);
  }
  return s;
}

/** 校验访问令牌归属该会话且未过期 */
export async function assertAccess(db: Db, sessionId: string, token: string | undefined) {
  if (!token) throw new ProblemError('INVALID_REQUEST', 'missing access session cookie');
  const [row] = await db
    .select()
    .from(accessSession)
    .where(eq(accessSession.tokenHash, sha256(token)));
  const now = new Date();
  if (
    !row ||
    row.assessmentSessionId !== sessionId ||
    row.revokedAt ||
    row.expiresAt.getTime() <= now.getTime()
  ) {
    throw new ProblemError('INVALID_REQUEST', 'access session invalid or expired');
  }
  return row;
}

export interface StepUpsertResult {
  stepKey: StepKey;
  revision: number;
  rebased: boolean;
}

/**
 * 分步保存（乐观锁）：
 * - 首次写入：不应带 expectedRevision，插入 revision=1
 * - 后续更新：必须带 expectedRevision，与库内一致才 +1，否则 409 STEP_CONFLICT 并回带当前 revision
 */
export async function upsertStep(
  db: Db,
  sessionId: string,
  stepKey: StepKey,
  answer: Record<string, unknown>,
  expectedRevision?: number,
): Promise<StepUpsertResult> {
  await getSession(db, sessionId);

  const [existing] = await db
    .select()
    .from(assessmentStep)
    .where(
      and(
        eq(assessmentStep.sessionId, sessionId),
        eq(assessmentStep.stepKey, stepKey),
      ),
    );

  // 首次写入
  if (!existing) {
    if (expectedRevision !== undefined && expectedRevision !== 1) {
      throw new ProblemError('STEP_CONFLICT', 'step does not exist yet but a revision was claimed', {
        currentRevision: ['0'],
      });
    }
    try {
      const [inserted] = await db
        .insert(assessmentStep)
        .values({ sessionId, stepKey, answer, revision: 1 })
        .returning();
      return { stepKey, revision: inserted!.revision, rebased: false };
    } catch {
      // 并发首写撞唯一约束 -> 冲突
      throw new ProblemError('STEP_CONFLICT', 'concurrent first write');
    }
  }

  // 更新必须携带正确的基版本
  if (expectedRevision === undefined) {
    throw new ProblemError('STEP_CONFLICT', 'expectedRevision is required to update a step', {
      currentRevision: [String(existing.revision)],
    });
  }
  if (expectedRevision !== existing.revision) {
    throw new ProblemError('STEP_CONFLICT', 'stale revision; rebase then retry', {
      currentRevision: [String(existing.revision)],
    });
  }

  const [updated] = await db
    .update(assessmentStep)
    .set({ answer, revision: existing.revision + 1, updatedAt: nowTs() })
    .where(
      and(
        eq(assessmentStep.sessionId, sessionId),
        eq(assessmentStep.stepKey, stepKey),
        eq(assessmentStep.revision, existing.revision),
      ),
    )
    .returning();

  if (!updated) {
    throw new ProblemError('STEP_CONFLICT', 'concurrent update lost the race', {
      currentRevision: [String(existing.revision + 1)],
    });
  }
  return { stepKey, revision: updated.revision, rebased: false };
}

/** 读取某会话全部步骤（恢复进度） */
export async function listSteps(db: Db, sessionId: string) {
  return db
    .select()
    .from(assessmentStep)
    .where(eq(assessmentStep.sessionId, sessionId));
}
