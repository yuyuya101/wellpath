/**
 * RFC9457 application/problem+json 错误契约（3.1 §8.3）
 * 8 个冻结错误码，禁止新增同义码。
 */
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const ERROR_CODES = {
  INVALID_REQUEST: { status: 400, title: 'Invalid request' },
  RECOVERY_INVALID: { status: 401, title: 'Recovery code is invalid or expired' },
  SESSION_NOT_FOUND: { status: 404, title: 'Assessment session not found' },
  STEP_CONFLICT: { status: 409, title: 'Step revision conflict' },
  PAYMENT_IDEMPOTENT_MISMATCH: { status: 409, title: 'Idempotency key reused with different payload' },
  VALIDATION_FAILED: { status: 422, title: 'Validation failed' },
  RATE_LIMITED: { status: 429, title: 'Rate limit exceeded' },
  INTERNAL_ERROR: { status: 500, title: 'Internal server error' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail: string;
  requestId?: string;
  fieldErrors?: Record<string, string[]>;
}

export class ProblemError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(code: ErrorCode, detail?: string, fieldErrors?: Record<string, string[]>) {
    super(detail ?? ERROR_CODES[code].title);
    this.name = 'ProblemError';
    this.status = ERROR_CODES[code].status as ContentfulStatusCode;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function toProblemBody(
  code: ErrorCode,
  detail: string,
  requestId?: string,
  fieldErrors?: Record<string, string[]>,
): ProblemBody {
  const meta = ERROR_CODES[code];
  return {
    type: `/errors/${code}`,
    title: meta.title,
    status: meta.status,
    code,
    detail,
    ...(requestId ? { requestId } : {}),
    ...(fieldErrors && Object.keys(fieldErrors).length ? { fieldErrors } : {}),
  };
}
