import { describe, it, expect } from 'vitest';
import { assess, HealthDomainError } from './assessment';
import {
  basalMetabolicRate,
  bmi,
  classifyBmi,
  healthyMinTargetWeight,
  targetWeekRange,
  totalDailyEnergy,
} from './formulas';
import { ACTIVITY_FACTORS, ALGORITHM_VERSION } from './constants';

describe('附录A 样例1：男 28/175/80→70/moderate', () => {
  const out = assess({
    sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80,
    targetWeightKg: 70, activity: 'moderate',
  });
  it('样例数值精确匹配', () => {
    expect(out.kind).toBe('complete');
    if (out.kind !== 'complete') return;
    const r = out.result;
    expect(r.bmi).toBe(26.1);
    expect(r.bmiCategory).toBe('overweight');
    expect(r.bmr).toBeCloseTo(1758.75, 5);
    expect(r.activityFactor).toBe(1.55);
    expect(r.tdee).toBe(2726);
    expect(r.recommendedIntake).toBe(2226);
    expect(r.weightDeltaKg).toBe(10);
    expect(r.isHealthyTarget).toBe(true);
    expect(r.targetDateRangeWeeks).toEqual({ fastestWeeks: 20, steadyWeeks: 40 });
    expect(r.minSafeFloorApplied).toBe(false);
    expect(r.algorithmVersion).toBe(ALGORITHM_VERSION);
  });
});

describe('附录A 样例2：女 24/162/65→58/light', () => {
  const out = assess({
    sex: 'female', ageYears: 24, heightCm: 162, weightKg: 65,
    targetWeightKg: 58, activity: 'light',
  });
  it('样例数值精确匹配', () => {
    expect(out.kind).toBe('complete');
    if (out.kind !== 'complete') return;
    const r = out.result;
    expect(r.bmi).toBe(24.8);
    expect(r.bmiCategory).toBe('normal');
    expect(r.bmr).toBeCloseTo(1381.5, 5);
    expect(r.activityFactor).toBe(1.375);
    expect(r.tdee).toBe(1900);
    expect(r.recommendedIntake).toBe(1400);
    expect(r.targetDateRangeWeeks).toEqual({ fastestWeeks: 14, steadyWeeks: 28 });
    expect(healthyMinTargetWeight(162)).toBeCloseTo(48.55, 2);
  });
});

describe('WHO 分类与五档活动系数', () => {
  it('BMI 四档边界', () => {
    expect(classifyBmi(18.4)).toBe('underweight');
    expect(classifyBmi(18.5)).toBe('normal');
    expect(classifyBmi(24.9)).toBe('normal');
    expect(classifyBmi(25.0)).toBe('overweight');
    expect(classifyBmi(29.9)).toBe('overweight');
    expect(classifyBmi(30.0)).toBe('obese');
  });
  it('五档系数冻结', () => {
    expect(ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9,
    });
    expect(totalDailyEnergy(1000, 'sedentary')).toBe(1200);
    expect(totalDailyEnergy(1000, 'athlete')).toBe(1900);
  });
  it('BMR 性别差异', () => {
    expect(basalMetabolicRate('male', 80, 175, 28)).toBeCloseTo(1758.75, 5);
    expect(basalMetabolicRate('female', 65, 162, 24)).toBeCloseTo(1381.5, 5);
  });
  it('BMI 保留1位', () => {
    expect(bmi(80, 175)).toBe(26.1);
  });
});

describe('目标体重规则', () => {
  it('低于健康下限 -> TARGET_TOO_LOW', () => {
    expect(() => assess({
      sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80,
      targetWeightKg: 55, activity: 'moderate',
    })).toThrow(HealthDomainError);
    try {
      assess({ sex: 'male', ageYears: 28, heightCm: 175, weightKg: 80, targetWeightKg: 55, activity: 'moderate' });
    } catch (e) {
      expect((e as HealthDomainError).code).toBe('TARGET_TOO_LOW');
    }
  });
  it('目标高于当前 -> INVALID_TARGET', () => {
    expect(() => assess({
      sex: 'male', ageYears: 28, heightCm: 175, weightKg: 70,
      targetWeightKg: 75, activity: 'moderate',
    })).toThrow(/INVALID_TARGET/);
  });
  it('维持目标：无区间，摄入=TDEE', () => {
    const out = assess({
      sex: 'male', ageYears: 28, heightCm: 175, weightKg: 70,
      targetWeightKg: 70, activity: 'light',
    });
    expect(out.kind).toBe('complete');
    if (out.kind !== 'complete') return;
    expect(out.result.targetDateRangeWeeks).toBeNull();
    expect(out.result.recommendedIntake).toBe(out.result.tdee);
  });
  it('周数向上取整', () => {
    expect(targetWeekRange(70, 67)).toEqual({ fastestWeeks: 6, steadyWeeks: 12 });
  });
});

describe('安全底线与保护路径', () => {
  it('女性低 TDEE 减重触底 1200 并标记', () => {
    const out = assess({
      sex: 'female', ageYears: 22, heightCm: 160, weightKg: 50,
      targetWeightKg: 48, activity: 'sedentary',
    });
    expect(out.kind).toBe('complete');
    if (out.kind !== 'complete') return;
    expect(out.result.recommendedIntake).toBe(1200);
    expect(out.result.minSafeFloorApplied).toBe(true);
    expect(out.result.warnings).toContain('intake_floor_applied');
  });
  it('孕期走保护路径，不出方案', () => {
    const out = assess({
      sex: 'female', ageYears: 28, heightCm: 165, weightKg: 60,
      targetWeightKg: 58, activity: 'light', specialCondition: 'pregnancy',
    });
    expect(out.kind).toBe('protected');
    expect(out.kind === 'protected' && out.reason).toBe('special_condition');
  });
  it('极端 BMI 拦截', () => {
    const low = assess({
      sex: 'female', ageYears: 20, heightCm: 175, weightKg: 30,
      targetWeightKg: 30, activity: 'sedentary',
    });
    expect(low.kind).toBe('protected');
    const high = assess({
      sex: 'male', ageYears: 30, heightCm: 175, weightKg: 130,
      targetWeightKg: 120, activity: 'light',
    });
    expect(high.kind).toBe('protected');
  });
});

describe('输入越界', () => {
  const base = { sex: 'male' as const, heightCm: 175, weightKg: 75, targetWeightKg: 70, activity: 'moderate' as const };
  it.each([
    { ageYears: 17 }, { ageYears: 101 }, { heightCm: 99 }, { heightCm: 251 }, { weightKg: 29 }, { weightKg: 301 },
  ])('越界 %s 抛 OUT_OF_RANGE', (over) => {
    expect(() => assess({ ...base, ageYears: 28, ...over } as never)).toThrow(HealthDomainError);
  });
});
