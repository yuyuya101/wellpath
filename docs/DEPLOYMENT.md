# WellPath 部署手册（Render + Neon，免信用卡）

> 技术栈：Next.js 16（App Router，标准 Node `next start`）+ Hono Route Handler + Drizzle + Postgres。

## 0. 前置账号
- GitHub（已登录）、Render（已登录，可用 GitHub 账号登入）、Neon（已登录）。

## 1. 数据库：Neon
1. Neon 控制台 **New Project**，区域选 **AWS Asia Pacific (Singapore) / ap-southeast-1**。
2. 创建后在 **Connection Details** 选择**直连（Direct，非 Pooled/PgBouncer）**连接串。
   - 本项目驱动 postgres-js 走标准扩展协议，必须用**直连端点**（主机名不含 `-pooler`）。
3. 复制 `postgresql://...sslmode=require`，即 `DATABASE_URL`。
4. 表结构由 Render 构建阶段 `pnpm db:migrate` 自动建立（九表迁移已随仓库），无需手工执行。

## 2. 密钥：RECOVERY_HMAC_KEY
- 32 字节随机十六进制。本地生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。
- 用于恢复码摘要（HMAC-SHA256）。**不要**提交进仓库；只填到 Render 环境变量。

## 3. 推送代码到 GitHub
```bash
# 在项目根目录（已 git init 且有提交）
# 方式 A：已安装并登录 gh
gh auth login                      # 浏览器授权一次
gh repo create wellpath --private --source=. --push
# 方式 B：先在 github.com 新建空仓库 wellpath（不勾选 README），然后：
git remote add origin https://github.com/<你的用户名>/wellpath.git
git branch -M main
git push -u origin main
```

## 4. Render 部署（Blueprint）
1. Render 控制台 **New + → Blueprint**，授权并选中 `wellpath` 仓库，读取根目录 `render.yaml`。
2. 在提示处填入两个密钥环境变量：
   - `DATABASE_URL`：第 1 步的 Neon **直连**串；
   - `RECOVERY_HMAC_KEY`：第 2 步生成的值。
3. 等待 Build（install → migrate → build）完成，拿到 `https://wellpath-xxxx.onrender.com`。
4. 健康检查：访问 `/api/health` 应返回 `{"status":"ok","db":"up",...}`。

## 5. 免费实例休眠保活（F-12）
- Render 免费实例 15 分钟无请求会休眠，冷启动约 30–60s。
- 到 [cron-job.org](https://cron-job.org)（免费、免信用卡）新建定时任务：
  - URL：`https://wellpath-xxxx.onrender.com/api/health`
  - 频率：每 **10 分钟**一次；
  - 作用：维持实例温热，同时验证数据库连通。

## 6. 部署后验收清单
- [ ] `/api/health` 返回 `db:"up"`；
- [ ] 首页 → 四步问卷 → 免费摘要正常；
- [ ] 模拟支付后出现完整结果与一次性恢复码；
- [ ] `/recovery` 用恢复码可找回；
- [ ] 响应头含 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`；
- [ ] GitHub Actions 三个 job（quality / migrate / e2e）全绿。

## 7. 本地运行
```bash
pnpm install
cp .env.example .env   # 填 DATABASE_URL(直连) 与 RECOVERY_HMAC_KEY
pnpm db:migrate        # 可选：本地也连 Neon；单测用 PGlite 无需 DATABASE_URL
pnpm dev
# 质量门禁
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# 端到端（需先 build；自动起 next start）
pnpm build && pnpm test:e2e
```

## 8. 排障
- **500 且日志 `Received an instance of Date`**：用了 `-pooler` 端点，改为直连。
- **`next start does not work with output: standalone`**：本项目已移除 standalone，用标准 `next start`，不要加该配置。
- **免费库冷启动慢导致首请求超时**：重试即可；生产由 cron-job.org 保活。
- **pnpm install 结尾 ERR_PNPM_IGNORED_BUILDS(esbuild)**：已知无害警告，esbuild 已在 `pnpm-workspace.yaml` 白名单 rebuild。
