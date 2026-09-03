# ADR-08 部署平台：Render 主部署（F-12）

- 状态：Accepted（3.1 冻结，替代 Vercel）
- 日期：2026-09-03

## 背景
Vercel 注册受阻。需要免信用卡、可用 GitHub 登录、支持标准 Node 运行时、Git 推送即部署的平台。

## 备选横评
- Render：免费 Web Service，标准 Node 运行时（next start 与 output: standalone 友好），GitHub 连仓自动部署，免信用卡。**选用**。
- Netlify：经 OpenNext 可全支持 App Router，作为备选。
- Zeabur：中文界面、港日节点快，但免费额度收紧，长期在线可能小额付费，备选。
- Railway/Fly：需信用卡，排除。

## 决策
- Web 服务部署在 Render 免费实例；build=`pnpm build`，start=`node .next/standalone/server.js`（或 pnpm start）。
- 数据库不用 Render 免费 PG（30 天到期），坚持用 Neon 长期免费实例，DATABASE_URL 在 Render 面板配置。
- 免费实例 15 分钟无访问休眠、冷启动约 1 分钟：评审期用 cron-job.org 每 10 分钟 ping /health 保活。

## 后果
平台不锁定业务代码（ADR-02）；需接受冷启动并主动保活；数据库与计算分离，切换平台只改连接与启动配置。
