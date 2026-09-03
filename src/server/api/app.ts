import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import { ProblemError, toProblemBody, ERROR_CODES } from './errors';
import { logger } from './logger';
import { assessmentsRoutes } from './routes/assessments';
import { paymentRoutes } from './routes/payment';

export interface AppDeps {
  db: Db;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    db: Db;
  };
}

const PROBLEM_HEADERS = { 'content-type': 'application/problem+json' } as const;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  // X-Request-Id：透传或生成，注入 db
  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('db', deps.db);
    await next();
    c.header('X-Request-Id', requestId);
  });

  // 健康检查（Render / cron-job.org 保活与就绪探针）
  app.get('/health', async (c) => {
    let dbOk = false;
    try {
      await c.var.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch (err) {
      logger.error({ err, requestId: c.get('requestId') }, 'health db check failed');
    }
    return c.json(
      {
        status: dbOk ? 'ok' : 'degraded',
        db: dbOk ? 'up' : 'down',
        version: '0.1.0',
        requestId: c.get('requestId'),
      },
      dbOk ? 200 : 503,
    );
  });

  // 业务路由
  app.route('/', assessmentsRoutes());
  app.route('/', paymentRoutes());

  app.notFound((c) => {
    const body = toProblemBody('INVALID_REQUEST', 'Route not found', c.get('requestId'));
    return c.json(body, 404, PROBLEM_HEADERS);
  });

  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? '';
    if (err instanceof ProblemError) {
      const body = toProblemBody(err.code, err.message, requestId, err.fieldErrors);
      return c.json(body, err.status, PROBLEM_HEADERS);
    }
    logger.error({ err, requestId }, 'unhandled error');
    const body = toProblemBody('INTERNAL_ERROR', ERROR_CODES.INTERNAL_ERROR.title, requestId);
    return c.json(body, 500, PROBLEM_HEADERS);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
