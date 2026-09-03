'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export function StartButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const { sessionId } = await api.createSession();
      router.push(`/assessment/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={start}
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 0,
          borderRadius: 10,
          padding: '12px 22px',
          fontSize: 15,
          cursor: loading ? 'wait' : 'pointer',
          minHeight: 44,
        }}
      >
        {loading ? 'Starting…' : 'Start free assessment'}
      </button>
      {error && (
        <p role="alert" style={{ color: '#c0392b', marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
