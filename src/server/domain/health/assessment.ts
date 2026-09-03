import {
  ALGORITHM_VERSION,
  BMI_THRESHOLDS,
  LIMITS,
  type ActivityLevel,
  type BmiCategory,
  type Sex,
  type SpecialCondition,
} from './constants';
import {
  activityFactor,
  basalMetabolicRate,
  bmi,
  classifyBmi,
  healthyMinTargetWeight,
  recommendedIntake,
  round1,
  targetWeekRange,
  totalDailyEnergy,
} from './formulas';

/** 领域层输入（已通过 Zod 结构校验，跨字段规则在此裁决） */
export interface HealthInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activity: ActivityLevel;
  specialCondition?: SpecialCondition;
}

/** 完整结果（会员可见全部字段；免费 DTO 由应用层按权益表裁剪） */
export interface HealthResult {
  algorithmVersion: typeof ALGORITHM_VERSION;
  bmi: number;
  bmiCategory: BmiCategory;
  weightDeltaKg: number;
  isHealthyTarget: boolean;
  bmr: number;
  activityFactor: number;
  tdee: number;
  recommendedIntake: number;
  minSafeFloorApplied: boolean;
  targetDateRangeWeeks: { fastestWeeks: number; steadyWeeks: number } | null;
  warnings: string[];
}

export type AssessmentOutcome =
  | { kind: 'complete'; result: HealthResult }
  | { kind: 'protected'; reason: 'special_condition' | 'extreme_bmi'; message: string };

/** 领域业务规则违例（携带字段，供上层映射 422 fieldErrors） */
export class HealthDomainError extends Error {
  constructor(
    public code: string,
    public fields: Record<string, string>,
  ) {
    super(code);
    this.name = 'HealthDomainError';
  }
}

function assertRange(value: number, range: { min: number; max: number }, field: string): void {
  if (value < range.min || value > range.max) {
    throw new HealthDomainError('OUT_OF_RANGE', {
      [field]: `must be between ${range.min} and ${range.max}`,
    });
  }
}

/**
 * 主计算：确定性、可复现、相同输入相同输出（3.1 §6）。
 */
export function assess(input: HealthInput): AssessmentOutcome {
  const { sex, ageYears, heightCm, weightKg, targetWeightKg, activity, specialCondition } = input;

  assertRange(ageYears, LIMITS.age, 'ageYears');
  assertRange(heightCm, LIMITS.heightCm, 'heightCm');
  assertRange(weightKg, LIMITS.weightKg, 'weightKg');

  // 孕期 / 哺乳期保护路径：不出减重方案（3.1 §6.3）
  if (specialCondition === 'pregnancy' || specialCondition === 'breastfeeding') {
    return {
      kind: 'protected',
      reason: 'special_condition',
      message: 'Pregnancy/breastfeeding users should consult a healthcare professional.',
    };
  }

  const bmiValue = bmi(weightKg, heightCm);

  // 极端 BMI：风险提示且不出减重方案
  if (bmiValue < BMI_THRESHOLDS.extremeLow || bmiValue > BMI_THRESHOLDS.extremeHigh) {
    return {
      kind: 'protected',
      reason: 'extreme_bmi',
      message: 'BMI is outside the safe range for an automated plan; consult a professional.',
    };
  }

  // 目标体重：不高于当前体重，且不低于健康下限
  const floor = healthyMinTargetWeight(heightCm);
  if (targetWeightKg > weightKg) {
    throw new HealthDomainError('INVALID_TARGET', {
      targetWeightKg: 'target must not exceed current weight',
    });
  }
  const isHealthyTarget = round1(targetWeightKg) >= round1(floor);
  if (!isHealthyTarget) {
    throw new HealthDomainError('TARGET_TOO_LOW', {
      targetWeightKg: `target is below the healthy floor ${floor}kg (BMI 18.5)`,
    });
  }

  const bmrRaw = basalMetabolicRate(sex, weightKg, heightCm, ageYears);
  const factor = activityFactor(activity);
  const tdee = totalDailyEnergy(bmrRaw, activity);
  const intake = recommendedIntake(sex, tdee, weightKg, targetWeightKg);
  const weeks = targetWeekRange(weightKg, targetWeightKg);
  const warnings: string[] = [];
  if (intake.floorApplied) warnings.push('intake_floor_applied');

  return {
    kind: 'complete',
    result: {
      algorithmVersion: ALGORITHM_VERSION,
      bmi: bmiValue,
      bmiCategory: classifyBmi(bmiValue),
      weightDeltaKg: round1(weightKg - targetWeightKg),
      isHealthyTarget,
      bmr: bmrRaw,
      activityFactor: factor,
      tdee,
      recommendedIntake: intake.value,
      minSafeFloorApplied: intake.floorApplied,
      targetDateRangeWeeks: weeks,
      warnings,
    },
  };
}
