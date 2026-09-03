/**
 * WellPath 数据模型（3.1 冻结版 第7章）—— Drizzle 九表
 * 状态字段用 text + TS 联合类型，枚举值由 Zod/应用层强约束。
 */
import {
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------- 枚举（TS 侧冻结，DB 存 text） ----------
export type SessionStatus = 'in_progress' | 'submitted' | 'deleted';
export type EntitlementTier = 'free' | 'premium';
export type SubscriptionStatus = 'active' | 'expired';
export type PaymentStatus = 'succeeded' | 'failed';
export type RateScope = 'create_session' | 'pay';

const now = () => new Date();

// 1) 测评会话 --------------------------------------------------
export const assessmentSession = pgTable('assessment_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').$type<SessionStatus>().notNull().default('in_progress'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 2) 分步答案（乐观锁：revision 独立列，唯一(session,step)） ----
export const assessmentStep = pgTable(
  'assessment_step',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => assessmentSession.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    answer: jsonb('answer').$type<Record<string, unknown>>().notNull(),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => [uniqueIndex('uq_step_session_key').on(t.sessionId, t.stepKey)],
);

// 3) 测评结果（会员完整 payload + 免费摘要） --------------------
export const assessmentResult = pgTable('assessment_result', {
  sessionId: uuid('session_id')
    .primaryKey()
    .references(() => assessmentSession.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  freeSummary: jsonb('free_summary').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
});

// 4) 权益（独立续期，过期回退免费但不删数据） ------------------
export const entitlement = pgTable('entitlement', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .unique()
    .references(() => assessmentSession.id, { onDelete: 'cascade' }),
  tier: text('tier').$type<EntitlementTier>().notNull().default('free'),
  source: text('source'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().default(now()),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// 5) 订阅（30 天） ---------------------------------------------
export const subscription = pgTable('subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => assessmentSession.id, { onDelete: 'cascade' }),
  status: text('status').$type<SubscriptionStatus>().notNull().default('active'),
  productCode: text('product_code').notNull(),
  externalRef: text('external_ref'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().default(now()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
});

// 6) 支付事件（Idempotency-Key 永久去重） ----------------------
export const paymentEvent = pgTable(
  'payment_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => assessmentSession.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    status: text('status').$type<PaymentStatus>().notNull(),
    fingerprint: jsonb('fingerprint').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
  },
  (t) => [uniqueIndex('uq_payment_idempotency').on(t.idempotencyKey)],
);

// 7) 恢复码（只存 HMAC 摘要，7 天单次） ------------------------
export const recoveryToken = pgTable('recovery_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => assessmentSession.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  used: boolean('used').notNull().default(false),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
});

// 8) 访问会话（cookie，24h，只证明访问不存会员状态） -----------
export const accessSession = pgTable('access_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  assessmentSessionId: uuid('assessment_session_id')
    .notNull()
    .references(() => assessmentSession.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now()),
});

// 9) 固定窗口限流计数 ------------------------------------------
export const rateCounter = pgTable(
  'rate_counter',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    scope: text('scope').$type<RateScope>().notNull(),
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('uq_rate_window').on(t.scope, t.subject, t.windowStart),
    index('idx_rate_window_start').on(t.windowStart),
  ],
);

// ---------- 关系（便于预加载，非外键策略变更） ----------
export const assessmentSessionRelations = relations(assessmentSession, ({ many, one }) => ({
  steps: many(assessmentStep),
  result: one(assessmentResult, {
    fields: [assessmentSession.id],
    references: [assessmentResult.sessionId],
  }),
  entitlement: one(entitlement, {
    fields: [assessmentSession.id],
    references: [entitlement.sessionId],
  }),
}));

export const assessmentStepRelations = relations(assessmentStep, ({ one }) => ({
  session: one(assessmentSession, {
    fields: [assessmentStep.sessionId],
    references: [assessmentSession.id],
  }),
}));
