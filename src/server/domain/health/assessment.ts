import {
  ALGORITHM_VERSION,
  BMI_THRESHOLDS,
  LIMITS,
  type ActivityLevel,
  type BmiCategory,
  type Goal,
  type Pace,
  type Sex,
  type SpecialCondition,
} from './constants';
import {
  activityFactor,
  basalMetabolicRate,
  bmi,
  classifyBmi,
  healthyMaxTargetWeight,
  healthyMinTargetWeight,
  planIntake,
  round1,
  targetTimeline,
  totalDailyEnergy,
  type EnergyDirection,
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
  /** 目标方向，缺省 lose（向后兼容 v1） */
  goal?: Goal;
  /** 节奏（决定缺口/盈余大小），缺省 moderate=500，与 v1 一致 */
  pace?: Pace;
}

/** 完整结果（会员可见全部字段；免费 DTO 由应用层按权益表裁剪） */
export interface HealthResult {
  algorithmVersion: typeof ALGORITHM_VERSION;
  goal: Goal;
  pace: Pace;
  energyDirection: EnergyDirection;
  /** 带符号的每日能量调整（kcal）：减重为负、增重为正、维持为 0 */
  energyAdjustment: number;
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
  const goal: Goal = input.goal ?? 'lose';
  const pace: Pace = input.pace ?? 'moderate';

  assertRange(ageYears, LIMITS.age, 'ageYears');
  assertRange(heightCm, LIMITS.heightCm, 'heightCm');
  assertRange(weightKg, LIMITS.weightKg, 'weightKg');

  // 孕期 / 哺乳期保护路径：不出热量方案（3.1 §6.3）
  if (specialCondition === 'pregnancy' || specialCondition === 'breastfeeding') {
    return {
      kind: 'protected',
      reason: 'special_condition',
      message: 'Pregnancy/breastfeeding users should consult a healthcare professional.',
    };
  }

  const bmiValue = bmi(weightKg, heightCm);

  // 极端 BMI：风险提示且不出自动方案
  if (bmiValue < BMI_THRESHOLDS.extremeLow || bmiValue > BMI_THRESHOLDS.extremeHigh) {
    return {
      kind: 'protected',
      reason: 'extreme_bmi',
      message: 'BMI is outside the safe range for an automated plan; consult a professional.',
    };
  }

  const floor = healthyMinTargetWeight(heightCm);
  const ceiling = healthyMaxTargetWeight(heightCm);
  const isMaintenance = Math.abs(weightKg - targetWeightKg) < 0.05 || goal === 'maintain';
  let isHealthyTarget = true;

  if (!isMaintenance) {
    if (goal === 'gain') {
      // 增重：目标必须高于当前，且不把目标设到超重区间（BMI ≤ 25）
      if (targetWeightKg <= weightKg) {
        throw new HealthDomainError('INVALID_TARGET', {
          targetWeightKg: 'a gain goal requires a target above current weight',
        });
      }
      if (round1(targetWeightKg) > round1(ceiling)) {
        throw new HealthDomainError('TARGET_TOO_HIGH', {
          targetWeightKg: `target is above the healthy ceiling ${ceiling}kg (BMI 25)`,
        });
      }
    } else {
      // 减重（默认）：目标不高于当前，且不低于健康下限 BMI 18.5
      if (targetWeightKg > weightKg) {
        throw new HealthDomainError('INVALID_TARGET', {
          targetWeightKg: 'target must not exceed current weight',
        });
      }
      isHealthyTarget = round1(targetWeightKg) >= round1(floor);
      if (!isHealthyTarget) {
        throw new HealthDomainError('TARGET_TOO_LOW', {
          targetWeightKg: `target is below the healthy floor ${floor}kg (BMI 18.5)`,
        });
      }
    }
  }

  const bmrRaw = basalMetabolicRate(sex, weightKg, heightCm, ageYears);
  const factor = activityFactor(activity);
  const tdee = totalDailyEnergy(bmrRaw, activity);
  const intake = planIntake(sex, tdee, weightKg, targetWeightKg, goal, pace);
  const weeks = isMaintenance ? null : targetTimeline(weightKg, targetWeightKg);
  const warnings: string[] = [];
  if (intake.floorApplied) warnings.push('intake_floor_applied');

  return {
    kind: 'complete',
    result: {
      algorithmVersion: ALGORITHM_VERSION,
      goal,
      pace,
      energyDirection: intake.direction,
      energyAdjustment: intake.adjustment,
      bmi: bmiValue,
      bmiCategory: classifyBmi(bmiValue),
      weightDeltaKg: round1(Math.abs(weightKg - targetWeightKg)),
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
