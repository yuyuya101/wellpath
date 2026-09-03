'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api, uuidv4 } from '@/lib/api-client';

type Direction = 'deficit' | 'maintenance' | 'surplus';

interface FullResult {
  goal: 'lose' | 'maintain' | 'gain';
  pace: 'steady' | 'moderate' | 'fast';
  energyDirection: Direction;
  energyAdjustment: number;
  bmi: number;
  bmiCategory: string;
  bmr: number;
  tdee: number;
  recommendedIntake: number;
  activityFactor: number;
  weightDeltaKg: number;
  minSafeFloorApplied: boolean;
  targetDateRangeWeeks: { fastestWeeks: number; steadyWeeks: number } | null;
  warnings: string[];
}
interface ProfileLite {
  bodyBuild?: string;
  dailyMovement?: string;
  workoutPreferences?: string[];
  weightTendency?: string;
  focusAreas?: string[];
  stairTolerance?: string;
}
interface FreeSummary {
  bmi: number;
  bmiCategory: string;
  isHealthyTarget: boolean;
  weightDeltaKg: number;
  goal?: 'lose' | 'maintain' | 'gain';
  pace?: string;
  energyDirection?: Direction;
  targetDateRangeWeeks: { fastestWeeks: number; steadyWeeks: number } | null;
  headline: string;
}
interface LockedField {
  key: string;
  label: string;
}
interface ResultResp {
  access: 'full' | 'free' | 'protected';
  message?: string;
  payload?: { result: FullResult; profile?: ProfileLite; recommendations?: string[] };
  freeSummary?: FreeSummary;
  locked?: boolean;
  entitlementTier?: 'free' | 'premium';
  entitlementExpiresAt?: string;
  lockedFields?: LockedField[];
  upgrade?: { required: boolean; productCode: string; endpoint: string; message: string };
}

const PRODUCT_CODE = 'wellpath_premium_30d';

const DIR_META: Record<Direction, { title: string; verb: string; sign: string }> = {
  deficit: { title: 'Your weight-loss plan', verb: 'lose', sign: '−' },
  surplus: { title: 'Your muscle-gain plan', verb: 'gain', sign: '+' },
  maintenance: { title: 'Your maintenance plan', verb: 'maintain', sign: '=' },
};

function timelineText(
  dir: Direction,
  delta: number,
  weeks: { fastestWeeks: number; steadyWeeks: number } | null,
): string | null {
  if (!weeks || dir === 'maintenance') return null;
  return `${weeks.fastestWeeks}–${weeks.steadyWeeks} weeks to ${DIR_META[dir].verb} ${delta} kg`;
}

const PROFILE_LABELS: Record<string, string> = {
  bodyBuild: 'Current build',
  dailyMovement: 'Daily movement',
  workoutPreferences: 'Workout preference',
  focusAreas: 'Focus areas',
  weightTendency: 'Weight tendency',
  stairTolerance: 'Stair tolerance',
};
const VALUE_LABELS: Record<string, string> = {
  slim: 'Slim', average: 'Average', athletic: 'Athletic', curvy: 'Curvy', plus: 'Plus-sized',
  desk: 'Mostly at a desk', light_moving: 'Sitting with some walking', on_feet: 'On my feet a lot', physical_job: 'Physical work',
  cardio: 'Cardio', strength: 'Strength', yoga: 'Yoga & mobility', walking: 'Walking', none: 'None yet',
  nutrition: 'Nutrition', activity: 'Activity', sleep: 'Sleep', consistency: 'Consistency',
  gain_fast_lose_slow: 'Gain easily, lose slowly', both_easy: 'Changes easily either way', hard_to_gain: 'Hard to gain', stable: 'Stable',
  easily: 'No problem', slightly: 'Slightly winded', one_flight: 'Tough after one flight', breathless: 'Avoid stairs',
};
function pretty(v: string): string {
  return VALUE_LABELS[v] ?? v.replace(/_/g, ' ');
}

export function ResultView({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ResultResp | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = (await api.result(sessionId)) as unknown as ResultResp;
    setData(r);
  }, [sessionId]);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'load failed'));
  }, [refresh]);

  async function checkout(simulateFail?: boolean) {
    setPaying(true);
    setError(null);
    try {
      const r = await api.pay({
        sessionId,
        idempotencyKey: uuidv4(),
        productCode: PRODUCT_CODE,
        ...(simulateFail ? { simulate: 'fail' as const } : {}),
      });
      if (r.status === 'failed') {
        setError('Payment failed (simulated). Your card was not charged. You can retry.');
        return;
      }
      if (r.recoveryCode) setRecoveryCode(r.recoveryCode);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.problem?.detail ?? e.message : 'checkout failed');
    } finally {
      setPaying(false);
    }
  }

  if (!data) return <main className="container"><p className="onb-sub">Loading…</p></main>;

  return (
    <main className="container">
      <span className="badge">Your result</span>

      <p style={{ margin: '0 0 10px' }}>
        <Link href={`/assessment/${sessionId}?edit=1`} style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>
          ‹ Edit my answers and recalculate
        </Link>
      </p>

      {data.access === 'protected' && (
        <section className="card">
          <h2>We recommend professional guidance</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{data.message}</p>
        </section>
      )}

      {data.access === 'free' && data.freeSummary && (
        <FreeBlock summary={data.freeSummary} lockedFields={data.lockedFields ?? []} upgradeMessage={data.upgrade?.message} paying={paying} onPay={() => checkout()} onFail={() => checkout(true)} />
      )}

      {data.access === 'full' && data.payload && (
        <FullBlock
          result={data.payload.result}
          profile={data.payload.profile}
          recommendations={data.payload.recommendations ?? []}
          expiresAt={data.entitlementExpiresAt}
        />
      )}

      {recoveryCode && (
        <div className="card note warn" role="alert" style={{ background: 'var(--warn-soft)' }}>
          <h2>Save your recovery code now</h2>
          <p style={{ fontSize: 13, color: 'var(--warn)' }}>
            It is shown only once. Store it securely to retrieve your plan on another device.
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', background: '#fff', padding: 12, borderRadius: 10, fontSize: 13, border: '1px solid var(--line)' }}>
            {recoveryCode}
          </code>
        </div>
      )}

      {error && <p className="note danger" role="alert">{error}</p>}
    </main>
  );
}

/* ---------------- free (locked) ---------------- */
function FreeBlock({
  summary,
  lockedFields,
  upgradeMessage,
  paying,
  onPay,
  onFail,
}: {
  summary: FreeSummary;
  lockedFields: LockedField[];
  upgradeMessage?: string;
  paying: boolean;
  onPay: () => void;
  onFail: () => void;
}) {
  const dir: Direction = summary.energyDirection ?? 'deficit';
  const meta = DIR_META[dir];
  const tl = timelineText(dir, summary.weightDeltaKg, summary.targetDateRangeWeeks);
  return (
    <section>
      <h1 style={{ fontSize: 28, marginBottom: 14 }}>{meta.title}</h1>
      <div className="card">
        <h2>Free summary</h2>
        <div className="stat-row"><span className="k">BMI</span><span className="v">{summary.bmi} ({summary.bmiCategory})</span></div>
        <div className="stat-row">
          <span className="k">Weight to goal</span>
          <span className="v">{summary.weightDeltaKg} kg to {meta.verb}</span>
        </div>
        {tl && <div className="stat-row"><span className="k">Estimated timeline</span><span className="v">{tl}</span></div>}
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 0 }}>{summary.headline}</p>
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Locked in the free plan</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--surface-soft)', borderRadius: 99, padding: '2px 10px' }}>
            {lockedFields.length} fields
          </span>
        </h2>
        {lockedFields.map((f) => (
          <div key={f.key} className="stat-row">
            <span className="k">{f.label}</span>
            <span style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--faint)' }}>🔒 Locked</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ border: '1.5px solid var(--accent)' }}>
        <h2>Unlock your full plan</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginTop: 0 }}>
          {upgradeMessage ?? 'Upgrade to unlock your full plan.'}
        </p>
        <button onClick={onPay} disabled={paying} className="btn btn-accent" style={{ width: '100%' }}>
          {paying ? 'Processing…' : 'Unlock now (simulated)'}
        </button>
        <Link
          href="/pricing"
          style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13.5, fontWeight: 600, color: 'var(--accent-ink)' }}
        >
          Compare free vs Premium
        </Link>
        {process.env.NODE_ENV !== 'production' && (
          <button onClick={onFail} className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }}>
            Simulate failed payment
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------- premium (full) ---------------- */
function FullBlock({
  result,
  profile,
  recommendations,
  expiresAt,
}: {
  result: FullResult;
  profile?: ProfileLite;
  recommendations: string[];
  expiresAt?: string;
}) {
  const meta = DIR_META[result.energyDirection];
  const tl = timelineText(result.energyDirection, result.weightDeltaKg, result.targetDateRangeWeeks);
  const formula =
    result.energyDirection === 'deficit'
      ? `TDEE ${result.tdee} ${meta.sign} ${Math.abs(result.energyAdjustment)} kcal`
      : result.energyDirection === 'surplus'
        ? `TDEE ${result.tdee} ${meta.sign} ${Math.abs(result.energyAdjustment)} kcal`
        : `= TDEE ${result.tdee} kcal (no deficit)`;

  const profileRows: Array<{ label: string; value: string }> = [];
  if (profile) {
    for (const [key, label] of Object.entries(PROFILE_LABELS)) {
      const v = profile[key as keyof ProfileLite];
      if (Array.isArray(v) && v.length) profileRows.push({ label, value: v.map(pretty).join(', ') });
      else if (typeof v === 'string') profileRows.push({ label, value: pretty(v) });
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>{meta.title}</h1>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.4px', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 99, padding: '4px 12px', whiteSpace: 'nowrap' }}>
          PREMIUM
        </span>
      </div>

      <div className="card" style={{ border: '1.5px solid var(--accent)', textAlign: 'center', padding: '26px 22px' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}>Recommended daily intake</div>
        <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--accent-ink)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '6px 0' }}>
          {result.recommendedIntake}
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--muted)' }}> kcal</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{formula}</div>
      </div>

      <div className="card">
        <h2>The numbers</h2>
        <div className="stat-row"><span className="k">BMI</span><span className="v">{result.bmi} ({result.bmiCategory})</span></div>
        <div className="stat-row"><span className="k">BMR (at rest)</span><span className="v">{Math.round(result.bmr)} kcal/day</span></div>
        <div className="stat-row"><span className="k">TDEE (maintenance)</span><span className="v">{result.tdee} kcal/day</span></div>
        <div className="stat-row"><span className="k">Activity factor</span><span className="v">{result.activityFactor}</span></div>
        <div className="stat-row"><span className="k">Weight to goal</span><span className="v">{result.weightDeltaKg} kg to {meta.verb}</span></div>
        {tl && <div className="stat-row"><span className="k">Timeline</span><span className="v hl">{tl}</span></div>}
        {result.minSafeFloorApplied && (
          <p className="note warn" style={{ marginBottom: 0 }}>
            Your intake was raised to the safe minimum floor for your sex — never eat below it.
          </p>
        )}
      </div>

      {recommendations.length > 0 && (
        <div className="card">
          <h2>Your personalised guidance</h2>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recommendations.map((t, i) => (
              <li key={i} style={{ color: 'var(--text)', fontSize: 14.5, lineHeight: 1.55 }}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {profileRows.length > 0 && (
        <div className="card">
          <h2>Your profile</h2>
          {profileRows.map((r) => (
            <div key={r.label} className="stat-row"><span className="k">{r.label}</span><span className="v" style={{ fontSize: 14.5 }}>{r.value}</span></div>
          ))}
        </div>
      )}

      {expiresAt && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
          Premium active until {new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      )}
    </section>
  );
}
