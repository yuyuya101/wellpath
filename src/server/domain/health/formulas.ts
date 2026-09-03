/**
 * 健康算法原子公式（纯函数，无 IO，无 Date.now，全部可复现 —— 3.1 §6.1/§6.4）
 */
import {
  ACTIVITY_FACTORS,
  BMI_THRESHOLDS,
  CALORIE_DEFICIT,
  CALORIE_DEFICIT_BY_PACE,
  CALORIE_SURPLUS_BY_PACE,
  LOSS_RATE_KG_PER_WEEK,
  MIN_SAFE_INTAKE,
  HEALTHY_GAIN_CEILING_BMI,
  type ActivityLevel,
  type BmiCategory,
  type Goal,
  type Pace,
  type Sex,
} from './constants';

/** cm -> m */
function toMeter(heightCm: number): number {
  return heightCm / 100;
}

/** BMI = kg / m^2，输出层保留 1 位小数 */
export function bmi(weightKg: number, heightCm: number): number {
  const raw = weightKg / toMeter(heightCm) ** 2;
  return round1(raw);
}

export function classifyBmi(bmiValue: number): BmiCategory {
  if (bmiValue < BMI_THRESHOLDS.underweight) return 'underweight';
  if (bmiValue < BMI_THRESHOLDS.overweight) return 'normal';
  if (bmiValue < BMI_THRESHOLDS.obese) return 'overweight';
  return 'obese';
}

/** Mifflin-St Jeor 基础代谢（kcal/天），保留完整精度，输出层再取整 */
export function basalMetabolicRate(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_FACTORS[level];
}

/** TDEE = BMR × 活动系数，四舍五入到整数 */
export function totalDailyEnergy(bmr: number, level: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_FACTORS[level]);
}

/**
 * 建议每日摄入量。
 * - 维持（目标体重 == 当前体重）：TDEE
 * - 减重：TDEE - 500，但不低于性别安全底线；触底时给出 floorApplied 标记
 */
export function recommendedIntake(
  sex: Sex,
  tdee: number,
  currentWeightKg: number,
  targetWeightKg: number,
): { value: number; floorApplied: boolean } {
  const floor = MIN_SAFE_INTAKE[sex];
  if (targetWeightKg >= currentWeightKg) {
    return { value: Math.round(tdee), floorApplied: false };
  }
  const candidate = Math.round(tdee - CALORIE_DEFICIT);
  if (candidate < floor) {
    return { value: floor, floorApplied: true };
  }
  return { value: candidate, floorApplied: false };
}

/** 健康目标体重下限 = 18.5 × h^2（kg），保留 2 位用于比较 */
export function healthyMinTargetWeight(heightCm: number): number {
  return round2(BMI_THRESHOLDS.healthyFloor * toMeter(heightCm) ** 2);
}

/**
 * 目标日期区间（周）：需减重量 Δ 按 0.5/0.25 kg/周换算，均向上取整（3.1 §6.1）
 * 维持目标返回 null。
 */
export function targetWeekRange(
  currentWeightKg: number,
  targetWeightKg: number,
): { fastestWeeks: number; steadyWeeks: number } | null {
  const delta = currentWeightKg - targetWeightKg;
  if (delta <= 0) return null;
  return {
    fastestWeeks: Math.ceil(delta / LOSS_RATE_KG_PER_WEEK.fast),
    steadyWeeks: Math.ceil(delta / LOSS_RATE_KG_PER_WEEK.steady),
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ============================ v2：目标方向（lose / maintain / gain） ============================ */

/** 增重目标体重健康上限 = 25 × h²（kg，BMI 25 之上不建议作为增重目标） */
export function healthyMaxTargetWeight(heightCm: number): number {
  return round2(HEALTHY_GAIN_CEILING_BMI * toMeter(heightCm) ** 2);
}

/** 方向无关的目标时间线（周）：按到目标的绝对距离 ÷ 速率，目标≈当前时为 null（维持） */
export function targetTimeline(
  currentWeightKg: number,
  targetWeightKg: number,
): { fastestWeeks: number; steadyWeeks: number } | null {
  const delta = Math.abs(currentWeightKg - targetWeightKg);
  if (delta < 0.05) return null;
  return {
    fastestWeeks: Math.ceil(delta / LOSS_RATE_KG_PER_WEEK.fast),
    steadyWeeks: Math.ceil(delta / LOSS_RATE_KG_PER_WEEK.steady),
  };
}

export type EnergyDirection = 'deficit' | 'maintenance' | 'surplus';

/**
 * 方向化每日摄入规划（确定性、纯函数）。
 * - maintain / 目标≈当前：TDEE
 * - lose：TDEE − 缺口（按 pace），不低于性别安全底线
 * - gain：TDEE + 盈余（按 pace）
 * 缺省 goal=lose、pace=moderate 时与 v1 recommendedIntake 数值完全一致（向后兼容）。
 */
export function planIntake(
  sex: Sex,
  tdee: number,
  currentWeightKg: number,
  targetWeightKg: number,
  goal: Goal = 'lose',
  pace: Pace = 'moderate',
): { value: number; floorApplied: boolean; direction: EnergyDirection; adjustment: number } {
  if (Math.abs(currentWeightKg - targetWeightKg) < 0.05 || goal === 'maintain') {
    return { value: Math.round(tdee), floorApplied: false, direction: 'maintenance', adjustment: 0 };
  }
  if (targetWeightKg < currentWeightKg && goal !== 'gain') {
    const deficit = CALORIE_DEFICIT_BY_PACE[pace];
    const candidate = Math.round(tdee - deficit);
    const floor = MIN_SAFE_INTAKE[sex];
    if (candidate < floor) {
      return { value: floor, floorApplied: true, direction: 'deficit', adjustment: -deficit };
    }
    return { value: candidate, floorApplied: false, direction: 'deficit', adjustment: -deficit };
  }
  const surplus = CALORIE_SURPLUS_BY_PACE[pace];
  return { value: Math.round(tdee + surplus), floorApplied: false, direction: 'surplus', adjustment: surplus };
}
