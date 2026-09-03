/**
 * 生产迁移入口：pnpm db:migrate（连 Neon 执行 drizzle/ 下 SQL）
 * 本地测试不经过这里（PGlite 在 createTestDb 内自动迁移）。
 */
// DATABASE_URL 由运行环境注入（本地用：node --env-file=.env ...；Render 在面板配置）
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: 'drizzle' });
  await client.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
