/** 单位换算：内部统一公制（算法口径），界面可切换英制（3.1 §8.4） */
export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type UnitSystem = 'metric' | 'imperial';

/** 公制 <-> 显示值 */
export function fromKg(kg: number | undefined, system: UnitSystem): string {
  if (kg === undefined || Number.isNaN(kg)) return '';
  return system === 'metric' ? String(round1(kg)) : String(round1(kgToLb(kg)));
}
export function toKg(display: number, system: UnitSystem): number {
  return round1(system === 'metric' ? display : lbToKg(display));
}
export function fromCm(cm: number | undefined, system: UnitSystem): string {
  if (cm === undefined || Number.isNaN(cm)) return '';
  return system === 'metric' ? String(round1(cm)) : String(round1(cmToIn(cm)));
}
export function toCm(display: number, system: UnitSystem): number {
  return round1(system === 'metric' ? display : inToCm(display));
}
