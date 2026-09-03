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
import { assess, HealthDomainError, type HealthResult } from '@/server/domain/health/assessment';
import { fullProfileSchema, flattenZodError, type FullProfile, type StepKey } from '@/server/validation/schemas';
import { ProblemError } from '@/server/api/errors';
import { nowTs, isoTs } from '@/server/infrastructure/db/time';

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
    // 带上具体字段错误，前端可据此跳回对应步骤；正常路径下单步强校验已先行拦截，
    // 这里是对历史脏数据/直连接口的最后一道防线。
    throw new ProblemError(
      'VALIDATION_FAILED',
      'assembled profile failed validation',
      flattenZodError(parsed.error),
    );
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

/** 读取步骤并计算出待持久化的 payload/freeSummary */
async function computeOutcome(db: Db, sessionId: string) {
  const steps = await db
    .select({ stepKey: assessmentStep.stepKey, answer: assessmentStep.answer })
    .from(assessmentStep)
    .where(eq(assessmentStep.sessionId, sessionId));
  const profile = assembleProfile(steps);
  // 领域规则违例（如目标体重高于当前、低于健康下限）属于可预期的输入问题，
  // 必须翻译为 422 VALIDATION_FAILED + 字段错误，绝不能冒泡成 500。
  let outcome: ReturnType<typeof assess>;
  try {
    outcome = assess(profile);
  } catch (err) {
    if (err instanceof HealthDomainError) {
      const fieldErrors: Record<string, string[]> = Object.fromEntries(
        Object.entries(err.fields).map(([field, msg]) => [field, [msg]]),
      );
      throw new ProblemError(
        'VALIDATION_FAILED',
        `health domain rule violated: ${err.code}`,
        fieldErrors,
      );
    }
    throw err;
  }
  if (outcome.kind === 'protected') {
    return {
      kind: 'protected' as const,
      payload: { kind: 'protected', reason: outcome.reason, message: outcome.message },
      freeSummary: { kind: 'protected', message: outcome.message },
    };
  }
  return {
    kind: 'complete' as const,
    payload: { kind: 'complete', profile, result: outcome.result },
    freeSummary: buildFreeSummary(profile, outcome.result),
  };
}

/**
 * 原子提交。
 * - 首次：组装->计算->写结果->submitted
 * - 已 submitted 且未要求重算：幂等返回，不重算（防双击）
 * - recalculate=true：允许已提交会话改答后重算（覆盖结果，权益保留）
 */
export async function submitAssessment(
  db: Db,
  sessionId: string,
  recalculate = false,
): Promise<SubmitOutcome> {
  const [session] = await db
    .select()
    .from(assessmentSession)
    .where(eq(assessmentSession.id, sessionId));
  if (!session || session.status === 'deleted') {
    throw new ProblemError('SESSION_NOT_FOUND', `session ${sessionId} not found`);
  }
  if (session.status === 'submitted' && !recalculate) {
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

  const computed = await computeOutcome(db, sessionId);
  await db.transaction(async (tx) => {
    await tx.delete(assessmentResult).where(eq(assessmentResult.sessionId, sessionId));
    await tx.insert(assessmentResult).values({
      sessionId,
      payload: computed.payload,
      freeSummary: computed.freeSummary,
    });
    await tx
      .update(assessmentSession)
      .set({ status: 'submitted', submittedAt: isoTs(session.submittedAt ?? new Date()), updatedAt: nowTs() })
      .where(eq(assessmentSession.id, sessionId));
  });

  return {
    sessionId,
    recomputed: true,
    kind: computed.kind,
    ...(computed.kind === 'protected'
      ? { protectedMessage: String(computed.payload.message) }
      : {}),
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

/**
 * 会员专属「保护字段」清单——会员/非会员边界的单一事实源（对应 3.1 §7.5 字段权益表）。
 * 免费结果通过 lockedFields 原样回传这份清单（引导付费、且可被测试逐项核对）；
 * 会员结果 lockedFields 为空数组。key 与 full payload.result 内的字段一一对应，
 * 严禁列入 payload 中并不存在的字段（契约与实现必须一致）。
 */
export const LOCKED_FIELDS = [
  { key: 'bmr', label: 'Basal metabolic rate (BMR), kcal/day' },
  { key: 'tdee', label: 'Daily total energy expenditure (TDEE), kcal/day' },
  { key: 'recommendedIntake', label: 'Recommended daily calorie intake, kcal/day' },
  { key: 'activityFactor', label: 'Applied activity factor' },
  { key: 'safeFloor', label: 'Safe minimum-calorie floor and its warning' },
] as const;

export type LockedField = (typeof LOCKED_FIELDS)[number];

/** 免费用户的结构化升级指引（公司要求：脱敏的同时“提示需付费”） */
const UPGRADE_CTA = {
  required: true,
  productCode: 'wellpath_premium_30d',
  endpoint: 'POST /api/pay',
  message:
    'Upgrade to premium to unlock BMR/TDEE, recommended intake, activity factor and the safe-floor note.',
} as const;

export type ResultView =
  | {
      access: 'full';
      entitlementTier: 'premium';
      entitlementExpiresAt: string;
      locked: false;
      lockedFields: LockedField[];
      payload: Record<string, unknown>;
    }
  | {
      access: 'free';
      entitlementTier: 'free';
      locked: true;
      lockedFields: LockedField[];
      upgrade: typeof UPGRADE_CTA;
      freeSummary: unknown;
    }
  | { access: 'protected'; message: string };

/**
 * T10：按权益做字段级脱敏。
 * - free：只回免费摘要 + 被锁字段清单 + 升级指引，响应物理上不含任何保护字段值；
 * - full：回完整 payload，lockedFields 为空，并显式回传会员层级与到期时间（订阅状态可见）。
 */
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

  const { ent, active } = await getActiveEntitlement(db, sessionId);
  if (active && ent?.expiresAt) {
    return {
      access: 'full',
      entitlementTier: 'premium',
      entitlementExpiresAt: ent.expiresAt.toISOString(),
      locked: false,
      lockedFields: [],
      payload,
    };
  }
  return {
    access: 'free',
    entitlementTier: 'free',
    locked: true,
    lockedFields: LOCKED_FIELDS.map((f) => ({ ...f })),
    upgrade: { ...UPGRADE_CTA },
    freeSummary: row.freeSummary,
  };
}
