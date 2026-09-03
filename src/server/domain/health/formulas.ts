/**
 * 健康算法原子公式（纯函数，无 IO，无 Date.now，全部可复现 —— 3.1 §6.1/§6.4）
 */
import {
  ACTIVITY_FACTORS,
  BMI_THRESHOLDS,
  CALORIE_DEFICIT,
  LOSS_RATE_KG_PER_WEEK,
  MIN_SAFE_INTAKE,
  type ActivityLevel,
  type BmiCategory,
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
