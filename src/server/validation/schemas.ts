/**
 * 共享 Zod 契约（3.1 §8）：前端 RHF 与后端 Hono 复用同一份 schema，
 * 保证前后端校验一致、错误字段同名。Zod 4。
 */
import { z } from 'zod';
import { LIMITS } from '@/server/domain/health/constants';

// ---------- 基础原子 ----------
export const sexSchema = z.enum(['male', 'female']);
export const activitySchema = z.enum(['sedentary', 'light', 'moderate', 'active', 'athlete']);
export const specialConditionSchema = z.enum(['pregnancy', 'breastfeeding']).nullable().optional();

/** 问卷分步键（前端步骤条与后端 step_key 共用，顺序即填写顺序） */
export const STEP_KEYS = ['basics', 'goal', 'activity', 'condition'] as const;
export const stepKeySchema = z.enum(STEP_KEYS);
export type StepKey = (typeof STEP_KEYS)[number];

// ---------- 各步骤答案 ----------
export const basicsAnswerSchema = z.object({
  sex: sexSchema,
  ageYears: z.number().int().min(LIMITS.age.min).max(LIMITS.age.max),
  heightCm: z.number().min(LIMITS.heightCm.min).max(LIMITS.heightCm.max),
  weightKg: z.number().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
});

export const goalAnswerSchema = z.object({
  targetWeightKg: z.number().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
});

export const activityAnswerSchema = z.object({ activity: activitySchema });
export const conditionAnswerSchema = z.object({ specialCondition: specialConditionSchema });

/** 单步答案：结构校验宽松到 record，强类型按 stepKey 在服务层分发 */
export const stepAnswerSchema = z.record(z.string(), z.unknown());

// ---------- 提交时合并出的完整画像（喂给 domain） ----------
export const fullProfileSchema = z.object({
  sex: sexSchema,
  ageYears: z.number().int().min(LIMITS.age.min).max(LIMITS.age.max),
  heightCm: z.number().min(LIMITS.heightCm.min).max(LIMITS.heightCm.max),
  weightKg: z.number().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
  targetWeightKg: z.number().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
  activity: activitySchema,
  specialCondition: specialConditionSchema,
});
export type FullProfile = z.infer<typeof fullProfileSchema>;

// ---------- API 请求体 ----------
export const patchStepBodySchema = z.object({
  stepKey: stepKeySchema,
  answer: stepAnswerSchema,
  /** 乐观锁：客户端持有的当前 revision；缺省视为首次写入 */
  expectedRevision: z.number().int().positive().optional(),
});
export type PatchStepBody = z.infer<typeof patchStepBodySchema>;

export const submitBodySchema = z.object({
  /** 幂等防重复提交，可选；后端同时以 session 状态兜底 */
  clientToken: z.string().uuid().optional(),
});

export const payBodySchema = z.object({
  sessionId: z.uuid(),
  idempotencyKey: z.uuid(),
  productCode: z.string().min(1).max(64),
  /** 仅非生产允许，用于覆盖失败分支 */
  simulate: z.enum(['fail']).optional(),
});
export type PayBody = z.infer<typeof payBodySchema>;

export const redeemBodySchema = z.object({ recoveryCode: z.string().min(16).max(128) });

// ---------- 错误扁平化（RFC9457 fieldErrors） ----------
export function flattenZodError(error: z.ZodError): Record<string, string[]> {
  const flat = error.flatten();
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(flat.fieldErrors ?? {})) {
    if (v) out[k] = (v as string[]).map(String);
  }
  return out;
}
