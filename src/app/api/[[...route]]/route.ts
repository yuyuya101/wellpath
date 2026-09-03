/**
 * 平台无关挂载点（ADR-02）：标准 Web Request/Response，
 * next start 可在 Render 等任意 Node 平台运行；不 import 任何平台适配器。
 */
import { createApp } from '@/server/api/app';
import { getProductionDb } from '@/server/infrastructure/db/client';

// Drizzle/PG 驱动需要 Node API
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 惰性创建，避免 build 阶段（无 DATABASE_URL）顶层连库
let appInstance: ReturnType<typeof createApp> | null = null;
function getApp() {
  if (!appInstance) appInstance = createApp({ db: getProductionDb() });
  return appInstance;
}

const handler = (req: Request) => getApp().fetch(req);

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE, handler as PUT };
