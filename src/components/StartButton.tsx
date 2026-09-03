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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <button
        onClick={start}
        disabled={loading}
        className="btn btn-primary"
        style={{ maxWidth: 340 }}
      >
        {loading ? 'Starting…' : 'Start free assessment'}
      </button>
      {error && (
        <p role="alert" className="note danger" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
