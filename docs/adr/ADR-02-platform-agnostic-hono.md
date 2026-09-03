# ADR-02 Hono 以平台无关方式挂载（F-12 修订）

- 状态：Accepted（3.1 冻结，F-12 修订替代 hono/vercel 方案）
- 日期：2026-09-03

## 背景
Vercel 注册受阻，主部署平台改为 Render（见 ADR-08）。API 层不得与任一平台运行时耦合。

## 决策
- Hono 应用在 `src/server/api/app.ts` 纯 TS 构建，不 import 任何平台适配器。
- 在 `src/app/api/[[...route]]/route.ts` 用 Next 标准 Route Handler 导出：`(req: Request) => app.fetch(req)`，标准 Web Request/Response。
- route segment `runtime = 'nodejs'`（Drizzle/PG 驱动需要 Node API）。

## 后果
- 同一份 Hono 应用可在 next start（Render 等 Node 平台）运行，也可脱离网络用 app.request 单测。
- 未来切 Vercel/Netlify/Zeabur 只改部署配置，不改业务代码。
