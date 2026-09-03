# WellPath 部署手册（Netlify 免费层，免信用卡）

> Render 要信用卡验证、Koyeb 被 Mistral 收购后取消免费层，最终选用 **Netlify**：
> $0 永久免费、GitHub 一键部署、官方 OpenNext runtime 原生支持 Next.js
> App Router / Route Handlers / SSR，函数按需启动、无 15 分钟休眠、无需保活。
> 数据库继续用已建好的 Neon（九表已迁移，无需在构建期再迁移）。

## 1. 注册 / 登录
1. 打开 https://app.netlify.com ，**Sign up / Log in with GitHub**（用 yuyuya101 授权）。
2. 免费 Starter，全程不需要信用卡。

## 2. 导入仓库
1. 进入 **Sites** → **Add new site** → **Import an existing project**。
2. 选 **Deploy with GitHub**，授权后选中仓库 **yuyuya101/wellpath**。
3. 构建配置 Netlify 会自动读到根目录 `netlify.toml`：
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - 框架识别为 **Next.js**（自动启用 Next runtime，无需手填 publish 目录）。
   - 若让你选分支，选 **main**。

## 3. 配置环境变量（点 Deploy 之前先加）
在 **Site configuration → Environment variables**（或导入页的 “Add environment variables”）逐个添加：

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon **直连**串（主机名不含 `-pooler`） |
| `RECOVERY_HMAC_KEY` | 32 字节十六进制密钥 |
| `RATE_LIMIT_SESSION_RPM` | `10` |
| `RATE_LIMIT_PAY_RPM` | `5` |

> 不要把这些写进仓库；`.env` 本就被 gitignore。

## 4. 部署
1. 点 **Deploy wellpath**，等待 Build 日志走完（首次约 2–4 分钟）。
2. 成功后得到 `https://<随机名>.netlify.app`，可在 Site settings → Change site name 改成 `wellpath-xxx`。

## 5. 验收
1. 打开 `https://<站点>/api/health`，应返回 `{"status":"ok","db":"up",...}`。
2. 完整走一遍：首页 → 四步问卷 → 免费摘要 → 模拟支付 → 完整结果 + 一次性恢复码。
3. 手机浏览器同样走一遍（响应式已做）。

## 6. 说明 / 排障
- **无需 cron 保活**：Netlify 函数按需冷启动，不像 Render 免费实例会持续休眠。
- **函数 60s 上限**：本项目所有接口都是毫秒级 DB 操作，远低于上限。
- **构建报 Next runtime / OpenNext 相关错误**：确认 Netlify 识别框架为 Next.js；必要时在 Site configuration 把 framework preset 手动选为 Next.js 后 Redeploy。
- **接口 500 且日志含 `Received an instance of Date`**：`DATABASE_URL` 误用 `-pooler`，换直连串。
- **接口 500 连不上库**：核对环境变量已保存并重新 deploy（环境变量改动后需 redeploy 生效）。
- **冷启动首次稍慢**：Neon 免费库空闲会休眠，首个请求可能等几秒，属正常。
