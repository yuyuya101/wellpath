/**
 * Onboarding client-side validation.
 *
 * The target-weight business rules below MUST stay identical to the server
 * domain rules in `src/server/domain/health/assessment.ts`. Both sides import
 * the same pure formulas (healthy floor/ceiling, round1) so the numbers can
 * never drift: invalid targets are now blocked on the target screen itself,
 * instead of surviving the whole questionnaire only to be rejected at submit.
 */
import { healthyMaxTargetWeight, healthyMinTargetWeight, round1 } from '@/server/domain/health/formulas';

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate a chosen target weight against goal direction and the WHO healthy
 * BMI band. Returns a user-facing message when invalid, or `null` when valid.
 * Mirrors server: gain requires current < target <= BMI25 ceiling;
 * lose requires BMI18.5 floor <= target < current.
 */
export function targetWeightIssue(
  goal: string | undefined,
  currentKg: unknown,
  heightCm: unknown,
  target: unknown,
): string | null {
  if (!finite(target)) return null;

  if (goal === 'gain') {
    if (finite(currentKg) && target <= currentKg) {
      return `For weight gain the target must be above your current ${currentKg} kg.`;
    }
    if (finite(heightCm) && round1(target) > round1(healthyMaxTargetWeight(heightCm))) {
      const ceiling = healthyMaxTargetWeight(heightCm);
      return `That's above the healthy ceiling of ${ceiling} kg (BMI 25) for your height — choose ${ceiling} kg or below.`;
    }
    return null;
  }

  // Default = lose (a maintain goal hides the target screen entirely).
  if (finite(currentKg) && target >= currentKg) {
    return `For weight loss the target must be below your current ${currentKg} kg.`;
  }
  if (finite(heightCm) && round1(target) < round1(healthyMinTargetWeight(heightCm))) {
    const floor = healthyMinTargetWeight(heightCm);
    return `That's below the healthy floor of ${floor} kg (BMI 18.5) for your height — choose ${floor} kg or above.`;
  }
  return null;
}
