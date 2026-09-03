import pino from 'pino';

/** 结构化 JSON 日志（ADR-07）。测试环境静默。 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'wellpath-api' },
});
