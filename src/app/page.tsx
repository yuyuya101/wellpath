import { StartButton } from '@/components/StartButton';

const GOALS = [
  { icon: '↓', title: 'Lose weight', desc: 'A safe, paced calorie deficit' },
  { icon: '＝', title: 'Maintain & get fit', desc: 'Hold weight, improve composition' },
  { icon: '↑', title: 'Gain muscle', desc: 'A controlled lean surplus' },
];

export default function HomePage() {
  return (
    <main className="container" style={{ textAlign: 'center', paddingTop: 64 }}>
      <span className="badge">WellPath · science-based</span>
      <h1>A plan built around your goal.</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.65, fontSize: 16.5, maxWidth: 560, margin: '0 auto 28px' }}>
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

      <StartButton />
      <p style={{ color: 'var(--faint)', fontSize: 12.5, marginTop: 16 }}>
        The summary is free. Unlock the full plan after checkout (simulated).
      </p>
    </main>
  );
}
