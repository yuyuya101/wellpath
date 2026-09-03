import { StartButton } from '@/components/StartButton';

export default function HomePage() {
  return (
    <main className="container">
      <span className="badge">WellPath</span>
      <h1>Your personalized wellness plan starts here.</h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
        Answer a 4-step questionnaire and get a science-based calorie and timeline plan.
        The summary is free; unlock the full plan after checkout.
      </p>
      <StartButton />
    </main>
  );
}
