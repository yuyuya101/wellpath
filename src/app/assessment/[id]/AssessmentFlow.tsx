'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { ApiError, api, type StepSaveResp } from '@/lib/api-client';
import { fromCm, fromKg, toCm, toKg, type UnitSystem } from '@/lib/units';

interface FormValues {
  sex: 'male' | 'female' | '';
  ageYears: number | undefined;
  heightCm: number | undefined;
  weightKg: number | undefined;
  targetWeightKg: number | undefined;
  activity: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete' | '';
  specialCondition: 'none' | 'pregnancy' | 'breastfeeding';
}

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'goal', label: 'Goal' },
  { key: 'activity', label: 'Activity' },
  { key: 'condition', label: 'Review' },
] as const;

const ACTIVITIES: Array<{ value: FormValues['activity']; label: string; hint: string }> = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise' },
  { value: 'light', label: 'Light', hint: 'Exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderate', hint: 'Exercise 3–5 days/week' },
  { value: 'active', label: 'Active', hint: 'Exercise 6–7 days/week' },
  { value: 'athlete', label: 'Athlete', hint: 'Physical job / 2x training daily' },
];

const DEFAULTS: FormValues = {
  sex: '',
  ageYears: undefined,
  heightCm: undefined,
  weightKg: undefined,
  targetWeightKg: undefined,
  activity: '',
  specialCondition: 'none',
};

export function AssessmentFlow({ sessionId, editMode = false }: { sessionId: string; editMode?: boolean }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [system, setSystem] = useState<UnitSystem>('metric');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, setValue, trigger, formState } = useForm<FormValues>({
    defaultValues: DEFAULTS,
    // 分步条件渲染会卸载非当前步字段，显式保留已填值，避免跨步丢失
    shouldUnregister: false,
  });
  const values = watch();

  // 恢复已有进度
  useEffect(() => {
    api
      .getSession(sessionId)
      .then((s) => {
        if (s.status === 'submitted' && !editMode) {
          router.replace(`/assessment/${sessionId}/result`);
          return;
        }
        const merged = { ...DEFAULTS } as FormValues;
        const rev: Record<string, number> = {};
        for (const st of s.steps) {
          Object.assign(merged, st.answer);
          rev[st.stepKey] = st.revision;
        }
        if (merged.specialCondition === (null as unknown as 'none')) merged.specialCondition = 'none';
        reset(merged);
        setRevisions(rev);
      })
      .catch((e) => setFatal(e instanceof Error ? e.message : 'failed to load'));
  }, [sessionId, reset, router, editMode]);

  const stepKey = STEPS[stepIndex]!.key;
  const progress = useMemo(() => ((stepIndex + 1) / STEPS.length) * 100, [stepIndex]);

  function setRevision(key: string, rev: number) {
    setRevisions((p) => ({ ...p, [key]: rev }));
  }

  // 保存单步；遇 409 自动 rebase（拉当前 revision）并重试一次
  async function persist(key: string, answer: Record<string, unknown>): Promise<StepSaveResp> {
    setSaveState('saving');
    try {
      const r = await api.saveStep(sessionId, key, answer, revisions[key]);
      setRevision(key, r.revision);
      setSaveState('saved');
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = Number(e.problem?.fieldErrors?.currentRevision?.[0] ?? '0');
        const r = await api.saveStep(sessionId, key, answer, current || undefined);
        setRevision(key, r.revision);
        setSaveState('saved');
        return r;
      }
      setSaveState('error');
      throw e;
    }
  }

  function answerFor(key: string, v: FormValues): Record<string, unknown> {
    if (key === 'basics')
      return { sex: v.sex, ageYears: v.ageYears, heightCm: v.heightCm, weightKg: v.weightKg };
    if (key === 'goal') return { targetWeightKg: v.targetWeightKg };
    if (key === 'activity') return { activity: v.activity };
    return { specialCondition: v.specialCondition === 'none' ? null : v.specialCondition };
  }

  async function next(v: FormValues) {
    const valid = await trigger(
      stepKey === 'basics'
        ? ['sex', 'ageYears', 'heightCm', 'weightKg']
        : stepKey === 'goal'
          ? ['targetWeightKg']
          : stepKey === 'activity'
            ? ['activity']
            : [],
    );
    if (!valid) return;
    await persist(stepKey, answerFor(stepKey, v));
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }

  async function finish(v: FormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await persist('condition', answerFor('condition', v));
      await api.submit(sessionId, editMode);
      router.push(`/assessment/${sessionId}/result`);
    } catch (e) {
      // 422：跨步骤业务规则（如目标体重高于当前/低于健康下限），定位回对应步骤并内联提示
      if (e instanceof ApiError && e.status === 422 && e.problem?.fieldErrors) {
        const fieldErrors = e.problem.fieldErrors;
        const firstField = Object.keys(fieldErrors)[0];
        const stepOf: Record<string, number> = {
          sex: 0, ageYears: 0, heightCm: 0, weightKg: 0,
          targetWeightKg: 1, activity: 2, specialCondition: 3,
        };
        if (firstField && stepOf[firstField] !== undefined) setStepIndex(stepOf[firstField]!);
        const msgs = Object.values(fieldErrors).flat().filter(Boolean);
        setSubmitError(msgs.length ? msgs.join(' ') : 'Some answers need your review.');
      } else {
        setFatal(e instanceof Error ? e.message : 'submit failed');
      }
      setSubmitting(false);
    }
  }

  if (fatal) {
    return (
      <main className="container">
        <p role="alert" style={{ color: '#c0392b' }}>
          {fatal}
        </p>
      </main>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 16,
    border: '1px solid #d0d5dd',
    borderRadius: 8,
    marginTop: 6,
  };
  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, display: 'block', marginTop: 14 };

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="badge">Step {stepIndex + 1}/4 · {STEPS[stepIndex]!.label}</span>
        <button
          type="button"
          onClick={() => setSystem((s) => (s === 'metric' ? 'imperial' : 'metric'))}
          style={{ border: '1px solid #d0d5dd', background: '#fff', borderRadius: 8, padding: '6px 12px', minHeight: 36 }}
        >
          {system === 'metric' ? 'Metric (kg/cm)' : 'Imperial (lb/in)'}
        </button>
      </div>
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, margin: '12px 0 24px' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width .2s' }} />
      </div>

      <form onSubmit={handleSubmit(stepIndex === STEPS.length - 1 ? finish : next)} noValidate>
        {submitError && (
          <p role="alert" style={{ color: '#c0392b', background: 'rgba(192,57,43,.08)', border: '1px solid rgba(192,57,43,.25)', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>
            {submitError}
          </p>
        )}
        {stepKey === 'basics' && (
          <section>
            <label style={labelStyle}>Biological sex</label>
            <div role="radiogroup" aria-label="Biological sex" style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {(['male', 'female'] as const).map((s) => (
                <button type="button" key={s} role="radio" aria-checked={values.sex === s}
                  onClick={() => setValue('sex', s, { shouldValidate: true })}
                  style={{ flex: 1, padding: 12, borderRadius: 8, minHeight: 44,
                    border: values.sex === s ? '2px solid var(--accent)' : '1px solid #d0d5dd',
                    background: values.sex === s ? 'rgba(47,125,107,.08)' : '#fff', textTransform: 'capitalize' }}>
                  {s}
                </button>
              ))}
            </div>
            {formState.errors.sex && <Err msg="Please select" />}

            <label style={labelStyle}>Age (years)</label>
            <input type="number" style={inputStyle} inputMode="numeric" aria-label="Age in years"
              {...register('ageYears', { required: true, valueAsNumber: true, min: 18, max: 100 })} />
            {formState.errors.ageYears && <Err msg="Age must be 18–100" />}

            <label style={labelStyle}>Height ({system === 'metric' ? 'cm' : 'in'})</label>
            <input type="number" style={inputStyle} inputMode="decimal" aria-label="Height"
              value={fromCm(values.heightCm, system)}
              onChange={(e) => setValue('heightCm', e.target.value === '' ? undefined : toCm(Number(e.target.value), system), { shouldValidate: true })} />
            {formState.errors.heightCm && <Err msg="Height must be 100–250 cm" />}

            <label style={labelStyle}>Current weight ({system === 'metric' ? 'kg' : 'lb'})</label>
            <input type="number" style={inputStyle} inputMode="decimal" aria-label="Current weight"
              value={fromKg(values.weightKg, system)}
              onChange={(e) => setValue('weightKg', e.target.value === '' ? undefined : toKg(Number(e.target.value), system), { shouldValidate: true })} />
            {formState.errors.weightKg && <Err msg="Weight must be 30–300 kg" />}
          </section>
        )}

        {stepKey === 'goal' && (
          <section>
            <label style={labelStyle}>Target weight ({system === 'metric' ? 'kg' : 'lb'})</label>
            <input type="number" style={inputStyle} inputMode="decimal" aria-label="Target weight"
              value={fromKg(values.targetWeightKg, system)}
              onChange={(e) => setValue('targetWeightKg', e.target.value === '' ? undefined : toKg(Number(e.target.value), system), { shouldValidate: true })} />
            {formState.errors.targetWeightKg && <Err msg="Enter a valid target weight" />}
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>
              Target should not exceed current weight or fall below BMI 18.5.
            </p>
          </section>
        )}

        {stepKey === 'activity' && (
          <section role="radiogroup" aria-label="Activity level">
            {ACTIVITIES.map((a) => (
              <button type="button" key={a.value} role="radio" aria-checked={values.activity === a.value}
                onClick={() => setValue('activity', a.value, { shouldValidate: true })}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: 14, marginTop: 10, borderRadius: 10, minHeight: 44,
                  border: values.activity === a.value ? '2px solid var(--accent)' : '1px solid #d0d5dd',
                  background: values.activity === a.value ? 'rgba(47,125,107,.08)' : '#fff' }}>
                <strong>{a.label}</strong>
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 13 }}>{a.hint}</span>
              </button>
            ))}
            {formState.errors.activity && <Err msg="Please select an activity level" />}
          </section>
        )}

        {stepKey === 'condition' && (
          <section>
            <label style={labelStyle}>Special conditions</label>
            {([
              { v: 'none', l: 'None' },
              { v: 'pregnancy', l: 'Pregnancy' },
              { v: 'breastfeeding', l: 'Breastfeeding' },
            ] as const).map((o) => (
              <label key={o.v} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', minHeight: 44 }}>
                <input type="radio" value={o.v} {...register('specialCondition')} />
                {o.l}
              </label>
            ))}
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Pregnancy/breastfeeding users receive a safety note instead of a deficit plan.
            </p>
          </section>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, gap: 12 }}>
          <button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex(stepIndex - 1)}
            style={{ padding: '12px 18px', borderRadius: 8, minHeight: 44, border: '1px solid #d0d5dd', background: '#fff', opacity: stepIndex === 0 ? 0.5 : 1 }}>
            Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SaveBadge state={saveState} />
            <button type="submit" disabled={submitting}
              style={{ padding: '12px 22px', borderRadius: 8, minHeight: 44, border: 0, background: 'var(--accent)', color: '#fff', fontSize: 15 }}>
              {stepIndex === STEPS.length - 1
                ? submitting
                  ? 'Submitting…'
                  : editMode
                    ? 'Update my result'
                    : 'See my result'
                : 'Next'}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function Err({ msg }: { msg: string }) {
  return <p style={{ color: '#c0392b', fontSize: 13, margin: '6px 0 0' }}>{msg}</p>;
}

function SaveBadge({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const map = { idle: '', saving: 'Saving…', saved: 'Auto-saved ✓', error: 'Save failed' } as const;
  if (!map[state]) return null;
  return <span style={{ fontSize: 13, color: state === 'error' ? '#c0392b' : 'var(--muted)' }}>{map[state]}</span>;
}
