import Link from 'next/link';
import { StartButton } from '@/components/StartButton';

const GOALS = [
  { icon: '↓', title: 'Lose weight', desc: 'A safe, paced calorie deficit' },
  { icon: '＝', title: 'Maintain & get fit', desc: 'Hold weight, improve composition' },
  { icon: '↑', title: 'Gain muscle', desc: 'A controlled lean surplus' },
];

const COMPARE = [
  'BMI and a safe target range',
  'Exact daily calorie target (BMR / TDEE)',
  'Realistic week-by-week timeline',
  'Personalised, deterministic guidance',
];

export default function HomePage() {
  return (
    <main className="container" style={{ textAlign: 'center', paddingTop: 56, paddingBottom: 64 }}>
      <span className="badge">WellPath · science-based</span>
      <h1>A plan built around your goal.</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.65, fontSize: 16.5, maxWidth: 560, margin: '0 auto 26px' }}>
        Answer a short, guided assessment and get a deterministic calorie target, a realistic
        timeline and a personalised plan — whether you want to lose, maintain or gain.
      </p>

      <div className="opt-grid" style={{ textAlign: 'left', marginBottom: 30 }}>
        {GOALS.map((g) => (
          <div key={g.title} className="card" style={{ margin: 0, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="opt-icon" aria-hidden style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontWeight: 800 }}>
              {g.icon}
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 15.5 }}>{g.title}</span>
              <span style={{ display: 'block', color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{g.desc}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Two clearly separated lanes: free funnel vs premium */}
      <div className="lane-grid" style={{ textAlign: 'left' }}>
        <div className="lane">
          <span className="lane-tag">Free · no card needed</span>
          <h3>Take the assessment</h3>
          <p>Get your BMI, goal summary and a realistic timeline at no cost. Upgrade only if you want the full numbers.</p>
          <StartButton label="Start free assessment" variant="primary" />
        </div>

        <div className="lane lane-prem">
          <span className="lane-tag">Premium · full plan</span>
          <h3>See what members unlock</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7 }}>
            {COMPARE.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Link href="/pricing" className="btn btn-accent">
            View Premium &amp; pricing
          </Link>
        </div>
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 12.5, margin: '4px auto 0', maxWidth: 560 }}>
        Checkout is simulated for this challenge — no real payment is taken. You can compare the
        free and member-only result at any step.
      </p>
    </main>
  );
}
