import { describe, it, expect, afterEach } from 'vitest';
import { createTestDb, type TestDbHandle } from '@/server/infrastructure/db/client';
import { assessmentSession, assessmentStep } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

let handle: TestDbHandle;

afterEach(async () => {
  await handle?.close();
});

describe('T03 PGlite 迁移与九表', () => {
  it('迁移成功且九张表全部建立', async () => {
    handle = await createTestDb();
    const res = await handle.db.execute(sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `);
    const rows = ('rows' in res ? res.rows : res) as Array<{ tablename: string }>;
    const names = rows.map((r) => r.tablename);
    expect(names).toEqual(
      [
        'access_session',
        'assessment_result',
        'assessment_session',
        'assessment_step',
        'entitlement',
        'payment_event',
        'rate_counter',
        'recovery_token',
        'subscription',
      ].sort(),
    );
  });

  it('乐观锁：WHERE revision=旧值 才更新，过期并发更新 0 行', async () => {
    handle = await createTestDb();
    const [s] = await handle.db.insert(assessmentSession).values({}).returning();
    await handle.db
      .insert(assessmentStep)
      .values({ sessionId: s!.id, stepKey: 'profile', answer: { age: 28 }, revision: 1 });

    // 客户端 A 基于 revision=1 更新成功
    const ok = await handle.db
      .update(assessmentStep)
      .set({ answer: { age: 29 }, revision: 2, updatedAt: new Date() })
      .where(and(eq(assessmentStep.sessionId, s!.id), eq(assessmentStep.stepKey, 'profile'), eq(assessmentStep.revision, 1)))
      .returning();
    expect(ok).toHaveLength(1);
    expect(ok[0]!.revision).toBe(2);

    // 客户端 B 仍基于过期 revision=1 更新 -> 0 行（409 STEP_CONFLICT 的 DB 依据）
    const stale = await handle.db
      .update(assessmentStep)
      .set({ answer: { age: 30 }, revision: 2, updatedAt: new Date() })
      .where(and(eq(assessmentStep.sessionId, s!.id), eq(assessmentStep.stepKey, 'profile'), eq(assessmentStep.revision, 1)))
      .returning();
    expect(stale).toHaveLength(0);
  });

  it('幂等：同(session,stepKey)重复插入被唯一约束拒绝', async () => {
    handle = await createTestDb();
    const [s] = await handle.db.insert(assessmentSession).values({}).returning();
    await handle.db.insert(assessmentStep).values({ sessionId: s!.id, stepKey: 'profile', answer: {} });
    await expect(
      handle.db.insert(assessmentStep).values({ sessionId: s!.id, stepKey: 'profile', answer: {} }),
    ).rejects.toThrow();
  });
});
