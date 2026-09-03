/**
 * 健康算法冻结常量（3.1 冻结版 第6章，algorithm_version = mifflin-v1.0.0）
 * 任何常量调整必须升 algorithm_version 并保留旧版本函数。
 */

export const ALGORITHM_VERSION = 'mifflin-v1.0.0' as const;

export const SEX = ['male', 'female'] as const;
export type Sex = (typeof SEX)[number];

/** 问卷运动频率 5 档 -> 活动系数（3.1 §6.2） */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

/** 输入合法边界（3.1 §6.3 / §8.4） */
export const LIMITS = {
  age: { min: 18, max: 100 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
} as const;

/** WHO 国际 BMI 阈值（面向英文消费者，ADR 备注） */
export const BMI_THRESHOLDS = {
  underweight: 18.5,
  overweight: 25.0,
  obese: 30.0,
  /** 健康目标体重下限系数；极端风险区间 */
  healthyFloor: 18.5,
  extremeLow: 15.0,
  extremeHigh: 40.0,
} as const;

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

/** 减重每日热量缺口（约 0.5kg/周） */
export const CALORIE_DEFICIT = 500;
/** 安全摄入底线（kcal/天） */
export const MIN_SAFE_INTAKE: Record<Sex, number> = { male: 1500, female: 1200 };
/** 安全减重速率（kg/周）：0.5 为快、0.25 为稳 */
export const LOSS_RATE_KG_PER_WEEK = { fast: 0.5, steady: 0.25 } as const;

export type SpecialCondition = 'pregnancy' | 'breastfeeding' | null;
