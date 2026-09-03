'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

export default function RecoveryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { sessionId } = await api.redeem(code.trim());
      router.push(`/assessment/${sessionId}/result`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'invalid code');
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <span className="badge">Recovery</span>
      <h1>Retrieve your plan</h1>
      <p style={{ color: 'var(--muted)' }}>Enter the recovery code shown after checkout.</p>
      <form onSubmit={redeem}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste your recovery code"
          style={{ width: '100%', padding: 12, fontSize: 15, borderRadius: 8, border: '1px solid #d0d5dd', minHeight: 44 }}
        />
        <button
          type="submit"
          disabled={busy || code.length < 16}
          style={{ marginTop: 14, background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 10, padding: '12px 22px', fontSize: 15, minHeight: 44 }}
        >
          {busy ? 'Verifying…' : 'Recover'}
        </button>
      </form>
      {error && (
        <p role="alert" style={{ color: '#c0392b', marginTop: 12 }}>
          {error}
        </p>
      )}
    </main>
  );
}
