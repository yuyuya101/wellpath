# WellPath 部署手册（Koyeb 免费层，免信用卡）

> 当 Render 要求信用卡验证而你没有国际信用卡时，改用 Koyeb：GitHub 登录、
> 免费 1 个 512MB Web 服务、通常**无需信用卡**。数据库仍用你已建好的 Neon，代码不变。

## 0. 已就绪
- 代码已推到 GitHub：`https://github.com/yuyuya101/wellpath`
- Neon 直连串、九表迁移已在本地验证通过。

## 1. 注册 Koyeb
1. 打开 https://app.koyeb.com ，**Sign up with GitHub**（用 yuyuya101 授权）。
2. 若询问是否绑卡，免费 Web Service 直接跳过即可。

## 2. 创建 Web Service
1. **Create Web Service** → 部署方式选 **GitHub**，授权并选中仓库 **wellpath**。
2. Builder 选 **Native/Buildpack**（语言 **Node.js**），不要选 Docker。
3. 填写命令：
   - **Build command**
     ```
     npm i -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm db:migrate && pnpm build
     ```
   - **Run command**
     ```
     pnpm start
     ```
4. **Instance**：选免费的 **free / eco（512MB）**；**Region 选 Frankfurt**（离 Neon 新加坡相对更近）。

## 3. 端口
- **Exposed port 填 `8000`**；
- 环境变量里加 `PORT=8000`（Next 会监听该端口；启动命令已绑定 `0.0.0.0`）。
- 协议选 HTTP。Health check path 填 `/api/health`。

## 4. 环境变量（Environment variables）逐个添加
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8000` |
| `DATABASE_URL` | Neon **直连**串（主机名不含 `-pooler`） |
| `RECOVERY_HMAC_KEY` | 32 字节十六进制密钥 |
| `RATE_LIMIT_SESSION_RPM` | `10` |
| `RATE_LIMIT_PAY_RPM` | `5` |

> Build 阶段也要能读到 `DATABASE_URL`（构建时执行 `pnpm db:migrate` 建表），
> Koyeb 的 service 环境变量对 build/run 都生效。

## 5. 部署与验收
1. 点 **Deploy**，等构建日志走到 build 完成、实例 Healthy。
2. 拿到 `https://wellpath-xxxx.koyeb.app`。
3. 访问 `https://wellpath-xxxx.koyeb.app/api/health`，应返回
   `{"status":"ok","db":"up",...}`。
4. 手机走一遍：首页 → 四步问卷 → 免费摘要 → 模拟支付 → 完整结果 + 恢复码。

## 6. 保活（scale-to-zero）
- Koyeb 免费实例一段时间无流量会缩容到零，冷启动约 30–60s。
- 在 https://cron-job.org 新建任务，每 **10 分钟** GET
  `https://wellpath-xxxx.koyeb.app/api/health` 保活。

## 7. 排障
- **构建期 db:migrate 连不上库**：确认用的是 Neon 直连串（无 `-pooler`），且 Koyeb 环境变量在 build 阶段可见。
- **实例起来但 502/打不开**：99% 是端口没对上——Exposed port 与 `PORT` 都要是 8000，且 Run 用 `pnpm start`（已绑 0.0.0.0）。
- **日志出现 `Received an instance of Date`**：连接串误用了 `-pooler`，换直连。
- **要求绑卡**：换个节点/用 GitHub 登录重试；Koyeb 免费 Web Service 一般可跳过。
