import { describe, expect, it } from 'vitest';
import { targetWeightIssue } from '@/app/assessment/[id]/validation';
import { healthyMaxTargetWeight, healthyMinTargetWeight } from '@/server/domain/health/formulas';

/**
 * These lock the onboarding target screen to the SAME healthy band the server
 * enforces in domain/health/assessment.ts (BMI 18.5 floor / BMI 25 ceiling),
 * so an invalid target can no longer survive the whole questionnaire and only
 * be rejected at final submit.
 */
describe('targetWeightIssue (client mirrors server healthy band)', () => {
  it('lose: target at/above current weight is rejected (direction)', () => {
    expect(targetWeightIssue('lose', 80, 175, 80)).toMatch(/below your current 80/);
    expect(targetWeightIssue('lose', 80, 175, 82)).toMatch(/below your current 80/);
  });

  it('lose: target below the BMI 18.5 floor is rejected with the floor value', () => {
    const floor = healthyMinTargetWeight(162); // 48.55
    expect(floor).toBeCloseTo(48.55, 2);
    expect(targetWeightIssue('lose', 65, 162, 48)).toMatch(/healthy floor of 48.55/);
  });

  it('lose: a target inside the healthy band passes (female 24/162/65 -> 58)', () => {
    expect(targetWeightIssue('lose', 65, 162, 58)).toBeNull();
  });

  it('lose: target exactly on the floor is allowed (boundary)', () => {
    expect(targetWeightIssue('lose', 65, 162, healthyMinTargetWeight(162))).toBeNull();
  });

  it('gain: target at/below current weight is rejected (direction)', () => {
    expect(targetWeightIssue('gain', 60, 175, 60)).toMatch(/above your current 60/);
    expect(targetWeightIssue('gain', 60, 175, 55)).toMatch(/above your current 60/);
  });

  it('gain: target above the BMI 25 ceiling is rejected with the ceiling value', () => {
    const ceiling = healthyMaxTargetWeight(175); // 76.56
    expect(ceiling).toBeCloseTo(76.56, 2);
    expect(targetWeightIssue('gain', 60, 175, 80)).toMatch(/healthy ceiling of 76.56/);
  });

  it('gain: a target inside the healthy band passes (male 28/175/60 -> 68)', () => {
    expect(targetWeightIssue('gain', 60, 175, 68)).toBeNull();
  });

  it('gain: target exactly on the ceiling is allowed (boundary)', () => {
    expect(targetWeightIssue('gain', 60, 175, healthyMaxTargetWeight(175))).toBeNull();
  });

  it('missing height does not raise the band error (server still backstops)', () => {
    expect(targetWeightIssue('lose', 80, undefined, 70)).toBeNull();
    expect(targetWeightIssue('gain', 60, undefined, 65)).toBeNull();
  });

  it('empty / non-finite target is not yet an error', () => {
    expect(targetWeightIssue('lose', 80, 175, '')).toBeNull();
    expect(targetWeightIssue('lose', 80, 175, undefined)).toBeNull();
  });
});
