'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api-client';

export function StartButton({
  label = 'Start free assessment',
  variant = 'primary',
  fullWidth = true,
}: {
  label?: string;
  variant?: 'primary' | 'accent';
  fullWidth?: boolean;
}) {
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <button
        onClick={start}
        disabled={loading}
        className={`btn ${variant === 'accent' ? 'btn-accent' : 'btn-primary'}`}
        style={fullWidth ? { maxWidth: 360, width: '100%' } : { maxWidth: 360 }}
      >
        {loading ? 'Starting…' : label}
      </button>
      {error && (
        <p role="alert" className="note danger" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
