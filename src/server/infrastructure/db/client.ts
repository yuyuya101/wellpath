/**
 * 数据库客户端工厂（ADR-04）：
 * - 本地/单测/集成测试：PGlite（WASM，零安装），每个用例独立内存库
 * - 预览/生产：postgres-js 连 Neon（SSL）
 * 仓储/服务层通过参数注入 db，不依赖全局单例，保证可测。
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

export interface TestDbHandle {
  db: PgliteDatabase<typeof schema>;
  raw: PGlite;
  close: () => Promise<void>;
}

/** 测试：全新内存 PGlite + 跑迁移 */
export async function createTestDb(migrationsFolder = 'drizzle'): Promise<TestDbHandle> {
  const raw = new PGlite();
  const db = drizzlePglite(raw, { schema });
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  await migrate(db, { migrationsFolder });
  return {
    db,
    raw,
    close: async () => raw.close(),
  };
}

let prodClient: ReturnType<typeof postgres> | null = null;
let prodDb: PostgresJsDatabase<typeof schema> | null = null;

/** 生产/预览：复用单例连接（Neon serverless 友好） */
export function getProductionDb(): PostgresJsDatabase<typeof schema> {
  if (prodDb) return prodDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Render 为长驻 Node 服务，使用 Neon 直连端点（非 -pooler）：标准扩展协议，
  // 支持 prepared statement 与 Date 参数；max:1 单连接避免 serverless 分支数占用。
  prodClient = postgres(url, { max: 1, onnotice: () => {} });
  prodDb = drizzlePostgres(prodClient, { schema });
  return prodDb;
}
