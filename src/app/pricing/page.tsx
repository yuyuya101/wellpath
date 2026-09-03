import type { Metadata } from 'next';
import Link from 'next/link';
import { StartButton } from '@/components/StartButton';

export const metadata: Metadata = { title: 'Premium · WellPath' };

const ROWS: { feature: string; free: string; prem: string; freeLocked?: boolean }[] = [
  { feature: 'BMI and weight category', free: 'Included', prem: 'Included' },
  { feature: 'Goal & energy direction (lose / maintain / gain)', free: 'Included', prem: 'Included' },
  { feature: 'Weight-to-goal and estimated timeline', free: 'Summary', prem: 'Exact week range' },
  { feature: 'Basal metabolic rate (BMR)', free: 'Locked', prem: 'Included', freeLocked: true },
  { feature: 'Daily energy expenditure (TDEE)', free: 'Locked', prem: 'Included', freeLocked: true },
  { feature: 'Recommended daily calorie intake', free: 'Locked', prem: 'Included', freeLocked: true },
  { feature: 'Applied activity factor & safe-floor note', free: 'Locked', prem: 'Included', freeLocked: true },
  { feature: 'Personalised, deterministic guidance', free: 'Locked', prem: 'Included', freeLocked: true },
  { feature: 'Saved answer profile & recovery code', free: 'Recovery only', prem: 'Included' },
  { feature: 'Premium access window', free: '—', prem: '30 days' },
];

export default function PricingPage() {
  return (
    <main className="container" style={{ paddingTop: 48, paddingBottom: 72 }}>
      <nav style={{ marginBottom: 20 }}>
        <Link href="/" className="inline-link" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
          ‹ Back to home
        </Link>
      </nav>

      <img
        className="section-art"
        src="/illustrations/premium-unlock.png"
        alt="An opened lock and key beside an analytics card, symbolising unlocking the premium plan"
        width={1600}
        height={900}
      />

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <span className="badge">WellPath Premium</span>
        <h1 style={{ marginBottom: 10 }}>Know exactly what to eat, every day.</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 580, margin: '0 auto', lineHeight: 1.65, fontSize: 16 }}>
          The free summary tells you the direction. Premium gives you the precise energy numbers,
          a realistic timeline and deterministic guidance built from your own answers.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 26 }}>
        <table className="compare">
          <thead>
            <tr>
              <th>What you get</th>
              <th>Free</th>
              <th>Premium</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.feature}>
                <td>{r.feature}</td>
                <td className={r.freeLocked ? 'no' : 'yes'}>{r.free}</td>
                <td className="yes">{r.prem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lane lane-prem" style={{ maxWidth: 560, margin: '0 auto 18px' }}>
        <span className="lane-tag">How upgrade works</span>
        <p style={{ margin: 0 }}>
          1. Start the assessment and answer the guided questions.&nbsp; 2. On your result page choose
          <strong> Upgrade to Premium</strong> and review the plan.&nbsp; 3. Complete the demo checkout
          (card details never leave your browser); the simulated <code>/pay</code> callback flips your
          subscription to active and the result page instantly expands from the masked summary to the
          full plan — no real card is charged.
        </p>
        <StartButton label="Start assessment, then unlock" variant="accent" />
      </div>

      <p style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 12.5 }}>
        Premium is a simulated subscription for this engineering challenge; entitlement is stored
        server-side and expires after 30 days.
      </p>
    </main>
  );
}
