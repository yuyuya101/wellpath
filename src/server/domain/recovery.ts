/**
 * 恢复码领域工具（3.1 §7.3 / P1-5）：
 * - 明文恢复码 32 字节随机，只在支付成功页展示一次；
 * - 数据库只存 HMAC-SHA256 摘要（RECOVERY_HMAC_KEY），不存明文；
 * - 比较使用常数时间，避免时序侧信道。
 */
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateRecoveryCode(): string {
  return randomBytes(32).toString('base64url');
}

function getKey(): string {
  const key = process.env.RECOVERY_HMAC_KEY;
  if (!key) throw new Error('RECOVERY_HMAC_KEY is not set');
  return key;
}

export function hashRecoveryCode(code: string): string {
  return createHmac('sha256', getKey()).update(code).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
