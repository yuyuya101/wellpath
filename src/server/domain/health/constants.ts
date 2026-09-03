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

/** 减重每日热量缺口（约 0.5kg/周）——moderate 档，保留为默认以向后兼容 */
export const CALORIE_DEFICIT = 500;
/** 安全摄入底线（kcal/天） */
export const MIN_SAFE_INTAKE: Record<Sex, number> = { male: 1500, female: 1200 };
/** 安全减重速率（kg/周）：0.5 为快、0.25 为稳 */
export const LOSS_RATE_KG_PER_WEEK = { fast: 0.5, steady: 0.25 } as const;

/* ===================== v2：目标方向与节奏（可选，缺省=旧减重口径） ===================== */

export const GOALS = ['lose', 'maintain', 'gain'] as const;
export type Goal = (typeof GOALS)[number];

export const PACES = ['steady', 'moderate', 'fast'] as const;
export type Pace = (typeof PACES)[number];

/** 减重每日热量缺口（kcal/天），按节奏：稳 250 / 标准 500 / 快 750 */
export const CALORIE_DEFICIT_BY_PACE: Record<Pace, number> = {
  steady: 250,
  moderate: 500,
  fast: 750,
};
/** 增重（瘦体重）每日热量盈余（kcal/天），按节奏：稳 200 / 标准 350 / 快 500 */
export const CALORIE_SURPLUS_BY_PACE: Record<Pace, number> = {
  steady: 200,
  moderate: 350,
  fast: 500,
};
/** 安全增重速率（kg/周），与减重对称：0.5 为快、0.25 为稳 */
export const GAIN_RATE_KG_PER_WEEK = { fast: 0.5, steady: 0.25 } as const;
/** 增重目标体重的健康上限 BMI（不建议把目标设到超重区间） */
export const HEALTHY_GAIN_CEILING_BMI = 25.0;

/* ===================== 报告型问卷枚举（不进核心公式，进会员个性化报告） ===================== */

export const BODY_BUILDS = ['slim', 'average', 'athletic', 'curvy', 'plus'] as const;
export type BodyBuild = (typeof BODY_BUILDS)[number];

export const DAILY_MOVEMENTS = ['desk', 'light_moving', 'on_feet', 'physical_job'] as const;
export type DailyMovement = (typeof DAILY_MOVEMENTS)[number];

export const WORKOUT_PREFERENCES = ['cardio', 'strength', 'yoga', 'walking', 'none'] as const;
export const FOCUS_AREAS = ['nutrition', 'activity', 'sleep', 'consistency'] as const;
export const WEIGHT_TENDENCIES = ['gain_fast_lose_slow', 'both_easy', 'hard_to_gain', 'stable'] as const;
export type WeightTendency = (typeof WEIGHT_TENDENCIES)[number];

export type SpecialCondition = 'pregnancy' | 'breastfeeding' | null;
