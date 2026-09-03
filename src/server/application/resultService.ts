/**
 * 结果应用服务（T09 提交事务 / T10 DTO 脱敏）。
 * 提交为原子事务：组装画像 -> 校验 -> 计算 -> 写结果 -> submitted，缺步整体回滚。
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import {
  assessmentResult,
  assessmentSession,
  assessmentStep,
  entitlement,
} from '@/server/infrastructure/db/schema';
import { assess, type HealthResult } from '@/server/domain/health/assessment';
import { fullProfileSchema, type FullProfile, type StepKey } from '@/server/validation/schemas';
import { ProblemError } from '@/server/api/errors';

const STEP_ORDER: StepKey[] = ['basics', 'goal', 'activity', 'condition'];

/** 从分步答案组装完整画像；缺步抛 422 并指出缺失步骤（事务回滚，不写结果） */
export function assembleProfile(stepRows: Array<{ stepKey: string; answer: unknown }>): FullProfile {
  const map = new Map(stepRows.map((r) => [r.stepKey, r.answer]));
  const missing = STEP_ORDER.filter((k) => !map.has(k));
  if (missing.length) {
    throw new ProblemError('VALIDATION_FAILED', 'assessment is incomplete', {
      missingSteps: missing,
    });
  }
  const merged = {
    ...(map.get('basics') as object),
    ...(map.get('goal') as object),
    ...(map.get('activity') as object),
    ...(map.get('condition') as object),
  };
  const parsed = fullProfileSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ProblemError('VALIDATION_FAILED', 'assembled profile failed validation');
  }
  return parsed.data;
}

/** 免费摘要：只保留非敏感概览，绝不包含 BMR/TDEE/摄入等保护字段 */
export function buildFreeSummary(profile: FullProfile, result: HealthResult) {
  return {
    bmi: result.bmi,
    bmiCategory: result.bmiCategory,
    isHealthyTarget: result.isHealthyTarget,
    weightDeltaKg: result.weightDeltaKg,
    targetDateRangeWeeks: result.targetDateRangeWeeks,
    headline: `Your BMI is ${result.bmi} (${result.bmiCategory}). Unlock your full plan for calories, timeline and daily targets.`,
    sex: profile.sex,
  };
}

export interface SubmitOutcome {
  sessionId: string;
  recomputed: boolean;
  kind: 'complete' | 'protected';
  protectedMessage?: string;
}

/** 原子提交；重复提交不重算（返回已有结果，recomputed=false） */
export async function submitAssessment(db: Db, sessionId: string): Promise<SubmitOutcome> {
  const [session] = await db
    .select()
    .from(assessmentSession)
    .where(eq(assessmentSession.id, sessionId));
  if (!session || session.status === 'deleted') {
    throw new ProblemError('SESSION_NOT_FOUND', `session ${sessionId} not found`);
  }
  if (session.status === 'submitted') {
    const [existing] = await db
      .select()
      .from(assessmentResult)
      .where(eq(assessmentResult.sessionId, sessionId));
    return {
      sessionId,
      recomputed: false,
      kind: (existing?.payload as { kind?: 'complete' | 'protected' })?.kind ?? 'complete',
    };
  }

  const steps = await db
    .select({ stepKey: assessmentStep.stepKey, answer: assessmentStep.answer })
    .from(assessmentStep)
    .where(eq(assessmentStep.sessionId, sessionId));
  const profile = assembleProfile(steps);
  const outcome = assess(profile);

  await db.transaction(async (tx) => {
    if (outcome.kind === 'protected') {
      await tx.insert(assessmentResult).values({
        sessionId,
        payload: { kind: 'protected', reason: outcome.reason, message: outcome.message },
        freeSummary: { kind: 'protected', message: outcome.message },
      });
    } else {
      const result = outcome.result;
      await tx.insert(assessmentResult).values({
        sessionId,
        payload: { kind: 'complete', profile, result },
        freeSummary: buildFreeSummary(profile, result),
      });
    }
    await tx
      .update(assessmentSession)
      .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(assessmentSession.id, sessionId));
  });

  return {
    sessionId,
    recomputed: true,
    kind: outcome.kind,
    ...(outcome.kind === 'protected' ? { protectedMessage: outcome.message } : {}),
  };
}

/** 当前是否享有有效 premium 权益 */
async function getActiveEntitlement(db: Db, sessionId: string) {
  const [ent] = await db
    .select()
    .from(entitlement)
    .where(and(eq(entitlement.sessionId, sessionId)));
  const now = Date.now();
  const active = !!ent && ent.tier === 'premium' && ent.expiresAt && ent.expiresAt.getTime() > now;
  return { ent, active };
}

export type ResultView =
  | { access: 'full'; payload: Record<string, unknown>; entitlementTier: 'premium' }
  | { access: 'free'; freeSummary: unknown; locked: true }
  | { access: 'protected'; message: string };

/** T10：按权益做字段级脱敏；免费 DTO 保证不含保护字段键 */
export async function getResultView(db: Db, sessionId: string): Promise<ResultView> {
  const [row] = await db
    .select()
    .from(assessmentResult)
    .where(eq(assessmentResult.sessionId, sessionId));
  if (!row) throw new ProblemError('INVALID_REQUEST', 'assessment not submitted yet');

  const payload = row.payload as Record<string, unknown>;
  if (payload.kind === 'protected') {
    return { access: 'protected', message: String(payload.message ?? '') };
  }

  const { active } = await getActiveEntitlement(db, sessionId);
  if (active) {
    return { access: 'full', payload, entitlementTier: 'premium' };
  }
  return { access: 'free', freeSummary: row.freeSummary, locked: true };
}
