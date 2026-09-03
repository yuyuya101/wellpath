'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api, uuidv4 } from '@/lib/api-client';

interface FullResult {
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
interface FreeSummary {
  bmi: number;
  bmiCategory: string;
  isHealthyTarget: boolean;
  weightDeltaKg: number;
  targetDateRangeWeeks: { fastestWeeks: number; steadyWeeks: number } | null;
  headline: string;
}
interface ResultResp {
  access: 'full' | 'free' | 'protected';
  message?: string;
  payload?: { result: FullResult };
  freeSummary?: FreeSummary;
  locked?: boolean;
}

const PRODUCT_CODE = 'wellpath_premium_30d';

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
      if (r.recoveryCode) setRecoveryCode(r.recoveryCode); // 仅首次成功返回，只展示一次
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.problem?.detail ?? e.message : 'checkout failed');
    } finally {
      setPaying(false);
    }
  }

  if (!data) return <main className="container"><p>Loading…</p></main>;

  return (
    <main className="container">
      <span className="badge">Your result</span>

      <p style={{ margin: '0 0 8px' }}>
        <Link href={`/assessment/${sessionId}?edit=1`} style={{ color: 'var(--accent)', fontSize: 14 }}>
          ← Edit my answers and recalculate
        </Link>
      </p>

      {data.access === 'protected' && (
        <section className="card">
          <h2>We recommend professional guidance</h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{data.message}</p>
        </section>
      )}

      {data.access === 'free' && data.freeSummary && (
        <section>
          <div className="card">
            <h2>Free summary</h2>
            <Stat label="BMI" value={`${data.freeSummary.bmi} (${data.freeSummary.bmiCategory})`} />
            <Stat label="Weight to goal" value={`${data.freeSummary.weightDeltaKg} kg`} />
            {data.freeSummary.targetDateRangeWeeks && (
              <Stat
                label="Estimated timeline"
                value={`${data.freeSummary.targetDateRangeWeeks.fastestWeeks}–${data.freeSummary.targetDateRangeWeeks.steadyWeeks} weeks`}
              />
            )}
            <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{data.freeSummary.headline}</p>
          </div>

          <div className="card" style={{ border: '1px solid var(--accent)' }}>
            <h2>Unlock your full plan</h2>
            <ul style={{ lineHeight: 1.8, paddingLeft: 18 }}>
              <li>Daily calorie target (BMR / TDEE breakdown)</li>
              <li>Personalized safe timeline</li>
              <li>One recovery code to retrieve your plan later</li>
            </ul>
            <button onClick={() => checkout()} disabled={paying} style={primaryBtn}>
              {paying ? 'Processing…' : 'Unlock now (simulated)'}
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <button onClick={() => checkout(true)} style={{ ...primaryBtn, background: '#6b7280', marginLeft: 10 }}>
                Simulate failed payment
              </button>
            )}
          </div>
        </section>
      )}

      {data.access === 'full' && data.payload && (
        <section>
          <div className="card" style={{ border: '1px solid var(--accent)' }}>
            <h2>Your full plan</h2>
            <Stat label="BMI" value={`${data.payload.result.bmi} (${data.payload.result.bmiCategory})`} />
            <Stat label="BMR" value={`${Math.round(data.payload.result.bmr)} kcal/day`} />
            <Stat label="TDEE" value={`${data.payload.result.tdee} kcal/day`} />
            <Stat label="Recommended intake" value={`${data.payload.result.recommendedIntake} kcal/day`} highlight />
            <Stat label="Activity factor" value={String(data.payload.result.activityFactor)} />
            {data.payload.result.targetDateRangeWeeks && (
              <Stat
                label="Timeline"
                value={`${data.payload.result.targetDateRangeWeeks.fastestWeeks}–${data.payload.result.targetDateRangeWeeks.steadyWeeks} weeks`}
              />
            )}
            {data.payload.result.minSafeFloorApplied && (
              <p style={{ color: '#b45309', fontSize: 13 }}>
                Your intake was raised to the safe minimum floor for your sex.
              </p>
            )}
          </div>
        </section>
      )}

      {recoveryCode && (
        <div className="card" style={{ background: '#fff7ed', border: '1px solid #f59e0b' }} role="alert">
          <h2>Save your recovery code now</h2>
          <p style={{ fontSize: 13, color: '#92400e' }}>
            It is shown only once. Store it securely to retrieve your plan on another device.
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', background: '#fff', padding: 12, borderRadius: 8, fontSize: 13 }}>
            {recoveryCode}
          </code>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#c0392b' }}>{error}</p>}
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <strong style={highlight ? { color: 'var(--accent)' } : undefined}>{value}</strong>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 0,
  borderRadius: 10,
  padding: '12px 20px',
  fontSize: 15,
  minHeight: 44,
  cursor: 'pointer',
  marginTop: 8,
};
