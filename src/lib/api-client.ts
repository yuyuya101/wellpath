/** 浏览器端同源 API 客户端（cookie 自动携带） */

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem?: { code?: string; detail?: string; fieldErrors?: Record<string, string[]> },
  ) {
    super(problem?.detail ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body ?? undefined);
  return body as T;
}

export interface StepSaveResp {
  stepKey: string;
  revision: number;
  rebased: boolean;
}

export const api = {
  createSession: () =>
    request<{ sessionId: string; status: string }>('/api/assessments', { method: 'POST' }),

  getSession: (id: string) =>
    request<{
      sessionId: string;
      status: string;
      steps: Array<{ stepKey: string; answer: Record<string, unknown>; revision: number }>;
    }>(`/api/assessments/${id}`),

  saveStep: (
    id: string,
    stepKey: string,
    answer: Record<string, unknown>,
    expectedRevision?: number,
  ) =>
    request<StepSaveResp>(`/api/assessments/${id}/steps/${stepKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ stepKey, answer, expectedRevision }),
    }),

  submit: (id: string) =>
    request<{ recomputed: boolean; kind: string }>(`/api/assessments/${id}/submit`, {
      method: 'POST',
    }),

  result: (id: string) => request<Record<string, unknown>>(`/api/assessments/${id}/result`),

  pay: (payload: { sessionId: string; idempotencyKey: string; productCode: string; simulate?: 'fail' }) =>
    request<{ status: string; replayed: boolean; recoveryCode: string | null; premiumExpiresAt: string | null }>(
      '/api/pay',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  redeem: (recoveryCode: string) =>
    request<{ sessionId: string }>('/api/recovery/redeem', {
      method: 'POST',
      body: JSON.stringify({ recoveryCode }),
    }),

  deleteSession: (id: string) =>
    request<{ deleted: boolean }>(`/api/assessments/${id}`, { method: 'DELETE' }),
};

export function uuidv4(): string {
  return crypto.randomUUID();
}
