'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import {
  ActionBar,
  ChipMulti,
  NumberField,
  OnbTopBar,
  OptionCard,
  OptionGrid,
  OptionStack,
  SectionProgress,
} from '@/components/onboarding/fields';
import {
  emptyForm,
  visibleScreens,
  type FormState,
  type Screen,
  type StepKey,
} from './flow-config';
import { targetWeightIssue } from './validation';
import { healthyMaxTargetWeight, healthyMinTargetWeight } from '@/server/domain/health/formulas';

const FIELD_LIMITS: Record<string, [number, number]> = {
  ageYears: [18, 100],
  heightCm: [100, 250],
  weightKg: [30, 300],
  targetWeightKg: [30, 300],
};

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    // 技术性冲突不要把 currentRevision 之类的机器字段直接抛给用户
    if (e.problem?.code === 'STEP_CONFLICT') {
      return 'Your answers were just saved in another request. Please press Continue again.';
    }
    if (e.problem?.code === 'RATE_LIMITED') {
      return 'You are going a little fast — please wait a few seconds and try again.';
    }
    const fe = e.problem?.fieldErrors;
    if (fe) {
      const first = Object.values(fe)[0];
      if (Array.isArray(first) && first.length && typeof first[0] === 'string') return first[0];
    }
    return e.problem?.detail ?? e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** 清洗为可落库的 step answer：去掉空串/undefined，保留合法 number、数组与 null */
function cleanStep(step: FormState[StepKey]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step)) {
    if (v === undefined || v === '') continue;
    out[k] = v;
  }
  return out;
}

function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 按 step + 字段名读取（屏幕配置的字段键是字符串，统一在此收窄类型） */
function readField(f: FormState, step: StepKey, field: string | undefined): unknown {
  if (!field) return undefined;
  return (f[step] as unknown as Record<string, unknown>)[field];
}

export default function AssessmentFlow({
  sessionId,
  editMode = false,
}: {
  sessionId: string;
  editMode?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [idx, setIdx] = useState(0);
  const [revisions, setRevisions] = useState<Record<string, number | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState<'idle' | 'saving' | 'saved'>('idle');

  const screens = useMemo(() => visibleScreens(form), [form]);
  const screen: Screen = screens[Math.min(idx, screens.length - 1)]!;

  /* ---------- restore ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getSession(sessionId);
        const f = emptyForm();
        const rev: Record<string, number | undefined> = {};
        for (const st of s.steps) {
          Object.assign(f[st.stepKey as StepKey] as object, st.answer);
          rev[st.stepKey] = st.revision;
        }
        if (cancelled) return;
        setForm(f);
        setRevisions(rev);
        setIdx(firstIncomplete(f));
      } catch (e) {
        if (!cancelled) setLoadError(errMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const setSingle = useCallback((step: StepKey, field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [step]: { ...prev[step], [field]: value } }));
    setFieldError(null);
  }, []);

  const toggleMulti = useCallback((step: StepKey, field: string, value: string) => {
    setForm((prev) => {
      const cur = (prev[step][field as keyof typeof prev[StepKey]] as string[] | undefined) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [step]: { ...prev[step], [field]: next } };
    });
  }, []);

  const persist = useCallback(
    async (step: StepKey, snapshot: FormState) => {
      setSavedLabel('saving');
      const resp = await api.saveStep(
        sessionId,
        step,
        cleanStep(snapshot[step]),
        revisions[step],
      );
      setRevisions((prev) => ({ ...prev, [step]: resp.revision }));
      setSavedLabel('saved');
    },
    [revisions, sessionId],
  );

  /* ---------- per-screen completeness / validation ---------- */
  const screenComplete = useCallback(
    (sc: Screen, f: FormState): boolean => {
      if (!sc.required) return true;
      if (sc.kind === 'cards' || sc.kind === 'rows') {
        const v = readField(f, sc.step, sc.field);
        return v !== undefined && v !== '';
      }
      if (sc.kind === 'number') return finiteNumber(readField(f, sc.step, sc.field));
      if (sc.kind === 'numbers') return sc.fields!.every((fld) => finiteNumber(readField(f, sc.step, fld)));
      return true; // chips are optional
    },
    [],
  );

  function validateScreen(sc: Screen, f: FormState): string | null {
    const inRange = (fld: string, v: unknown): string | null => {
      if (!finiteNumber(v)) return 'Please enter a number.';
      const [lo, hi] = FIELD_LIMITS[fld] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
      if (v < lo || v > hi) return `Please enter a value between ${lo} and ${hi}.`;
      return null;
    };
    if (sc.kind === 'number') {
      const fld = String(sc.field);
      const v = readField(f, sc.step, sc.field);
      const r = inRange(fld, v);
      if (r) return r;
      if (fld === 'targetWeightKg' && finiteNumber(v)) {
        // 与服务端同一套健康边界（方向 + BMI 18.5/25），当场拦截，不等提交
        const issue = targetWeightIssue(f.goal.goal, f.basics.weightKg, f.basics.heightCm, v);
        if (issue) return issue;
      }
      return null;
    }
    if (sc.kind === 'numbers') {
      for (const fld of sc.fields!) {
        const r = inRange(String(fld), readField(f, sc.step, fld));
        if (r) return r;
      }
    }
    return null;
  }

  /* ---------- navigation ---------- */
  const isLast = idx >= screens.length - 1;
  const canContinue = screenComplete(screen, form);

  async function finish(snapshot: FormState) {
    // 幂等确保四个持久化步骤都已落库，再提交由 fullProfileSchema 做最终完整性裁决
    for (const step of ['basics', 'goal', 'activity', 'condition'] as StepKey[]) {
      await persist(step, snapshot);
    }
    await api.submit(sessionId, editMode);
    router.push(`/assessment/${sessionId}/result`);
  }

  async function next() {
    const vErr = validateScreen(screen, form);
    if (vErr) {
      setFieldError(vErr);
      return;
    }
    setBanner(null);
    setBusy(true);
    try {
      let snapshot = form;
      // maintain 不需要目标/节奏屏：离开 goal 屏时把目标体重自动设为当前体重
      if (screen.id === 'goal' && form.goal.goal === 'maintain') {
        snapshot = {
          ...form,
          goal: { ...form.goal, targetWeightKg: form.basics.weightKg ?? '' },
        };
        setForm(snapshot);
      }
      // 关键：最后一屏不在此单独持久化当前步——finish() 会按最新 revision
      // 统一持久化全部四步；若先写一次再让 finish 重写当前步，会因乐观锁
      // 版本过期触发 409 STEP_CONFLICT（前端曾把回带的 currentRevision 误显示成报错）。
      if (isLast) {
        await finish(snapshot);
      } else {
        await persist(screen.step, snapshot);
        setFieldError(null);
        setIdx((i) => i + 1);
      }
    } catch (e) {
      // 服务端最终校验（如目标越过 BMI 健康带）返回字段级错误时，
      // 直接跳回对应那一屏并内联标红，而不是在最后一屏只丢一句横幅让用户自己翻回去
      if (e instanceof ApiError && e.problem?.fieldErrors) {
        const entry = Object.entries(e.problem.fieldErrors)[0];
        if (entry) {
          const [fname, msgs] = entry;
          const at = screens.findIndex(
            (sc) => sc.field === fname || (sc.fields?.includes(fname) ?? false),
          );
          const msg = Array.isArray(msgs) && msgs.length ? String(msgs[0]) : errMessage(e);
          if (at >= 0) {
            setBanner(null);
            setIdx(at);
            setFieldError(msg);
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
      }
      setBanner(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setBanner(null);
    setFieldError(null);
    setIdx((i) => Math.max(0, i - 1));
  }

  /* ---------- render helpers ---------- */
  function singleValue(sc: Screen): string {
    const v = readField(form, sc.step, sc.field);
    if (v === undefined || v === '') return '';
    if (v === null) return '__none'; // specialCondition: selected "None"
    return String(v);
  }

  function renderBody(sc: Screen) {
    if (sc.kind === 'cards' || sc.kind === 'rows') {
      const cur = singleValue(sc);
      const Wrapper = sc.kind === 'cards' ? OptionGrid : OptionStack;
      return (
        <Wrapper>
          {sc.options!.map((o) => (
            <OptionCard
              key={o.value}
              label={o.label}
              hint={o.hint}
              selected={cur === o.value}
              onSelect={() => setSingle(sc.step, String(sc.field), o.value === '__none' ? null : o.value)}
            />
          ))}
        </Wrapper>
      );
    }
    if (sc.kind === 'chips') {
      const values = (readField(form, sc.step, sc.multiField) as string[] | undefined)?.map(String) ?? [];
      return (
        <ChipMulti
          options={sc.options!}
          values={values}
          onToggle={(v) => toggleMulti(sc.step, String(sc.multiField), v)}
        />
      );
    }
    if (sc.kind === 'number') {
      const fld = String(sc.field);
      const dynamic = targetCopy(sc, form);
      return (
        <NumberField
          label={dynamic.label}
          unit={sc.units?.[fld]}
          value={(readField(form, sc.step, sc.field) as number | '' | undefined) ?? ''}
          onChange={(n) => setSingle(sc.step, fld, n)}
          error={fieldError ?? undefined}
          hint={dynamic.hint}
        />
      );
    }
    // two numeric inputs
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sc.fields!.map((fld) => (
          <NumberField
            key={fld}
            label={METRIC_LABELS[fld] ?? fld}
            unit={sc.units?.[fld]}
            value={(readField(form, sc.step, fld) as number | '' | undefined) ?? ''}
            onChange={(n) => setSingle(sc.step, fld, n)}
            error={fieldError ?? undefined}
          />
        ))}
      </div>
    );
  }

  if (loading) {
    return <p className="onb-sub" style={{ marginTop: 40 }}>Loading your assessment…</p>;
  }
  if (loadError) {
    return (
      <div className="card">
        <h2>Unable to load this assessment</h2>
        <p className="onb-sub">{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <OnbTopBar section={screen.section} onBack={idx > 0 ? back : () => router.push('/')} />
      <SectionProgress total={screens.length} current={idx} />

      <h2 className="onb-question">{screen.title}</h2>
      {screen.subtitle && <p className="onb-sub">{screen.subtitle}</p>}

      <div style={{ marginTop: 8 }}>{renderBody(screen)}</div>

      {banner && (
        <div className="note danger" role="alert" style={{ marginTop: 18 }}>
          {banner}
        </div>
      )}

      <ActionBar>
        {idx > 0 && (
          <button type="button" className="btn btn-ghost" onClick={back} disabled={busy}>
            Back
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
          disabled={busy || !canContinue}
        >
          {busy ? 'Saving…' : isLast ? 'See my results' : 'Continue'}
        </button>
      </ActionBar>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span className="save-state">
          {savedLabel === 'saving' ? 'Saving progress…' : savedLabel === 'saved' ? 'Progress saved' : ''}
        </span>
      </div>
    </div>
  );
}

const METRIC_LABELS: Record<string, string> = {
  heightCm: 'Height',
  weightKg: 'Current weight',
};

/** 目标体重屏随 goal 方向变化的文案与健康范围提示 */
function targetCopy(sc: Screen, f: FormState): { label: string; hint?: string } {
  if (sc.id !== 'target') return { label: 'Value' };
  const h = f.basics.heightCm;
  const cur = f.basics.weightKg;
  if (f.goal.goal === 'gain') {
    const ceiling = finiteNumber(h) ? healthyMaxTargetWeight(h) : undefined;
    return {
      label: 'Weight you want to reach',
      hint:
        finiteNumber(cur) && ceiling
          ? `Above your current ${cur} kg. Healthy ceiling for your height is about ${ceiling} kg (BMI 25).`
          : 'Enter a target above your current weight.',
    };
  }
  const floor = finiteNumber(h) ? healthyMinTargetWeight(h) : undefined;
  return {
    label: 'Your target weight',
    hint:
      finiteNumber(cur) && floor
        ? `Below your current ${cur} kg. Healthy floor for your height is about ${floor} kg (BMI 18.5).`
        : 'Enter a target below your current weight.',
  };
}

/** 恢复时定位到第一个未完成的必填屏；全部完成则回到开头 */
function firstIncomplete(f: FormState): number {
  const list = visibleScreens(f);
  for (let i = 0; i < list.length; i += 1) {
    const sc = list[i]!;
    if (!sc.required) continue;
    if (sc.kind === 'cards' || sc.kind === 'rows') {
      const v = readField(f, sc.step, sc.field);
      if (v === undefined || v === '') return i;
    } else if (sc.kind === 'number') {
      if (!finiteNumber(readField(f, sc.step, sc.field))) return i;
    } else if (sc.kind === 'numbers') {
      if (!sc.fields!.every((fld) => finiteNumber(readField(f, sc.step, fld)))) return i;
    }
  }
  return 0;
}
