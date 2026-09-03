/**
 * Onboarding screen configuration (design-system v2).
 * Persistence stays in 4 steps (basics/goal/activity/condition);
 * these 13 screens collect fields that are aggregated into those steps.
 * `required=false` screens are report-only and can be skipped.
 */
import type { Goal, Pace } from '@/server/domain/health/constants';

export type StepKey = 'basics' | 'goal' | 'activity' | 'condition';

export interface FormState {
  basics: {
    sex?: 'male' | 'female';
    ageYears?: number | '';
    heightCm?: number | '';
    weightKg?: number | '';
    bodyBuild?: string;
  };
  goal: {
    goal?: Goal;
    targetWeightKg?: number | '';
    pace?: Pace;
  };
  activity: {
    activity?: string;
    dailyMovement?: string;
    workoutPreferences?: string[];
    stairTolerance?: string;
  };
  condition: {
    specialCondition?: 'pregnancy' | 'breastfeeding' | null;
    weightTendency?: string;
    focusAreas?: string[];
  };
}

export const emptyForm = (): FormState => ({
  basics: {},
  goal: {},
  activity: { workoutPreferences: [] },
  // specialCondition 初始留空（未答）；用户选 None 才落 null
  condition: { focusAreas: [] },
});

export interface ScreenOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Screen {
  id: string;
  section: string;
  step: StepKey;
  title: string;
  subtitle?: string;
  kind: 'cards' | 'rows' | 'chips' | 'number' | 'numbers';
  /** single-value field bound to this screen (key within its step) */
  field?: string;
  /** number fields for a two-input 'numbers' screen */
  fields?: string[];
  options?: ScreenOption[];
  /** multi-select field (chips / multi cards) */
  multiField?: string;
  units?: Record<string, string>;
  required?: boolean;
  numeric?: { min: number; max: number; integer?: boolean };
}

export const SCREENS: Screen[] = [
  {
    id: 'sex',
    section: 'About you',
    step: 'basics',
    title: 'What is your biological sex?',
    subtitle: 'Used for the Mifflin–St Jeor metabolism equation.',
    kind: 'cards',
    field: 'sex',
    required: true,
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  {
    id: 'age',
    section: 'About you',
    step: 'basics',
    title: 'How old are you?',
    kind: 'number',
    field: 'ageYears',
    required: true,
    units: { ageYears: 'years' },
    numeric: { min: 18, max: 100, integer: true },
  },
  {
    id: 'metrics',
    section: 'About you',
    step: 'basics',
    title: 'Your height and current weight',
    kind: 'numbers',
    fields: ['heightCm', 'weightKg'],
    required: true,
    units: { heightCm: 'cm', weightKg: 'kg' },
  },
  {
    id: 'goal',
    section: 'About you',
    step: 'goal',
    title: "What's your main goal?",
    kind: 'cards',
    field: 'goal',
    required: true,
    options: [
      { value: 'lose', label: 'Lose weight', hint: 'A controlled calorie deficit to shed fat' },
      { value: 'maintain', label: 'Maintain & get fit', hint: 'Hold your weight, improve body composition' },
      { value: 'gain', label: 'Gain weight / muscle', hint: 'A small surplus to build lean mass' },
    ],
  },
  {
    id: 'target',
    section: 'About you',
    step: 'goal',
    title: 'Your target and preferred pace',
    subtitle: 'We keep every target inside a medically safe range.',
    kind: 'number',
    field: 'targetWeightKg',
    required: true,
    units: { targetWeightKg: 'kg' },
    numeric: { min: 30, max: 300 },
  },
  {
    id: 'pace',
    section: 'About you',
    step: 'goal',
    title: 'How fast do you want to progress?',
    kind: 'rows',
    field: 'pace',
    required: true,
    options: [
      { value: 'steady', label: 'Steady', hint: 'Gentler change, easiest to sustain long-term' },
      { value: 'moderate', label: 'Moderate', hint: 'Balanced — recommended for most people' },
      { value: 'fast', label: 'Faster', hint: 'A more aggressive deficit / surplus' },
    ],
  },
  {
    id: 'build',
    section: 'About you',
    step: 'basics',
    title: 'Describe your current build',
    kind: 'cards',
    field: 'bodyBuild',
    options: [
      { value: 'slim', label: 'Slim' },
      { value: 'average', label: 'Average' },
      { value: 'athletic', label: 'Athletic' },
      { value: 'curvy', label: 'Curvy' },
      { value: 'plus', label: 'Plus-sized' },
    ],
  },
  {
    id: 'condition',
    section: 'About you',
    step: 'condition',
    title: 'Any condition we should account for?',
    subtitle: 'Pregnancy and breastfeeding use a protected, no-deficit path.',
    kind: 'rows',
    field: 'specialCondition',
    required: true,
    options: [
      { value: '__none', label: 'None of these' },
      { value: 'pregnancy', label: 'Pregnant' },
      { value: 'breastfeeding', label: 'Breastfeeding' },
    ],
  },
  {
    id: 'activity',
    section: 'Activity',
    step: 'activity',
    title: 'How active are you overall?',
    kind: 'rows',
    field: 'activity',
    required: true,
    options: [
      { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise, mostly desk-bound' },
      { value: 'light', label: 'Lightly active', hint: 'Light exercise 1–3 days a week' },
      { value: 'moderate', label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
      { value: 'active', label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
      { value: 'athlete', label: 'Athlete level', hint: 'Physical job or twice-daily training' },
    ],
  },
  {
    id: 'movement',
    section: 'Activity',
    step: 'activity',
    title: 'How much do you move during a normal day?',
    subtitle: 'Non-workout movement also affects daily energy burn.',
    kind: 'rows',
    field: 'dailyMovement',
    options: [
      { value: 'desk', label: 'Mostly sitting at a desk' },
      { value: 'light_moving', label: 'Sitting with some walking' },
      { value: 'on_feet', label: 'On my feet for much of the day' },
      { value: 'physical_job', label: 'Physical / manual work' },
    ],
  },
  {
    id: 'workout',
    section: 'Activity',
    step: 'activity',
    title: 'What workouts do you enjoy? (choose any)',
    kind: 'chips',
    multiField: 'workoutPreferences',
    options: [
      { value: 'cardio', label: 'Cardio' },
      { value: 'strength', label: 'Strength' },
      { value: 'yoga', label: 'Yoga & mobility' },
      { value: 'walking', label: 'Walking' },
      { value: 'none', label: 'None yet' },
    ],
  },
  {
    id: 'stairs',
    section: 'Activity',
    step: 'activity',
    title: 'How do you feel climbing several flights of stairs?',
    kind: 'rows',
    field: 'stairTolerance',
    options: [
      { value: 'easily', label: 'No problem at all' },
      { value: 'slightly', label: 'Slightly winded' },
      { value: 'one_flight', label: 'Tough after one flight' },
      { value: 'breathless', label: 'I usually avoid stairs' },
    ],
  },
  {
    id: 'tendency',
    section: 'Habits & goal',
    step: 'condition',
    title: 'How does your weight usually respond?',
    kind: 'rows',
    field: 'weightTendency',
    options: [
      { value: 'gain_fast_lose_slow', label: 'I gain easily and lose slowly' },
      { value: 'both_easy', label: 'I change weight fairly easily either way' },
      { value: 'hard_to_gain', label: "It's hard for me to gain weight" },
      { value: 'stable', label: 'My weight stays stable' },
    ],
  },
  {
    id: 'focus',
    section: 'Habits & goal',
    step: 'condition',
    title: 'Where do you want the most support? (choose any)',
    kind: 'chips',
    multiField: 'focusAreas',
    options: [
      { value: 'nutrition', label: 'Nutrition' },
      { value: 'activity', label: 'Activity' },
      { value: 'sleep', label: 'Sleep' },
      { value: 'consistency', label: 'Consistency' },
    ],
  },
];

/** Screens hidden for a maintain goal (target/pace are not needed). */
export function visibleScreens(form: FormState): Screen[] {
  const isMaintain = form.goal.goal === 'maintain';
  return SCREENS.filter((s) => !(isMaintain && (s.id === 'target' || s.id === 'pace')));
}
