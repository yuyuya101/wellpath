# WellPath 验收报告（对照 3.1 冻结版任务矩阵 T01–T23）

日期：2026-09-03 ｜ 提交：3 个 Conventional Commits（day1 / day2 / day3）

## 里程碑
| 里程碑 | 范围 | 状态 | 证据 |
|---|---|---|---|
| M1 | T01–T08 骨架/领域/会话 | ✅ | commit 3830e41，32 测试 + build |
| M2 | T09–T15 免费→支付→解锁闭环 | ✅ | commit e0d63ef，flow 10 用例 + 前端可点 |
| M3 | T16–T23 加固/测试/部署/交付 | ✅（部署待账号侧点击） | commit a84bdc4，43 测试 + 双视口 E2E |

## 任务逐项
| 任务 | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| T01 | Next16+Hono+Drizzle/PGlite 骨架、健康检查 | ✅ | `/api/health` db=up |
| T02 | 九表 schema + 迁移 | ✅ | schema.test 3 例；Neon 真实迁移成功 |
| T03 | 权益/订阅/访问/恢复/支付/限流数据模型 | ✅ | 九表关系与唯一约束 |
| T04 | Zod 契约（请求/领域/错误展平） | ✅ | 422 fieldErrors 用例 |
| T05 | Mifflin 领域算法（冻结常量） | ✅ | domain 19 例，数值断言 |
| T06 | 平台无关 Route Handler + RFC9457 | ✅ | 8 错误码 problem+json |
| T07 | 会话创建/恢复、HttpOnly cookie | ✅ | api 10 例 |
| T08 | 分步保存 + 乐观锁 revision | ✅ | 409 + currentRevision 用例 |
| T09 | 原子提交，缺步回滚 | ✅ | flow：缺步 422 且无结果残留 |
| T10 | 结果 DTO 字段级脱敏 | ✅ | 序列化串不含保护键 |
| T11 | 30 天权益 + HMAC 单次恢复码 | ✅ | 单次/过期用例 |
| T12 | 支付两态机 + 永久幂等 | ✅ | 双击一次权益/异参 409/重放不显码 |
| T13 | DB 固定窗口限流 | ✅ | 第 11 次 429 |
| T14 | RHF 四步问卷、进度、单位、自动保存/409 rebase、恢复 | ✅ | E2E 走通 |
| T15 | 免费摘要/模拟支付/完整结果/恢复码仅一次 | ✅ | E2E 断言 2226 kcal + 恢复码 |
| T16 | 改答重算，权益保留，重复提交幂等 | ✅ | flow 新增 1 例（TDEE 2726→2111） |
| T17 | 移动/无障碍 | ✅ | focus-visible/skip link/viewport/radiogroup/44px/16px/reduced-motion |
| T18 | 唯一 Playwright 双视口冒烟 | ✅ | desktop + iPhone12 两 project 全绿 |
| T19 | GitHub Actions CI | ✅ | quality/migrate/e2e 三 job（push 后云端执行） |
| T20 | Render+Neon 部署、保活 | ⏳ 代码就绪 | render.yaml + DEPLOYMENT.md；需在 Render 控制台点一次（见下） |
| T21 | 安全收口 | ✅ | 安全头/同源/硬删/密钥不入库/audit 无 high+ |
| T22 | OpenAPI 契约 | ✅ | docs/openapi.json（3.1，合法 JSON） |
| T23 | 交付包 | ✅ | README/验收/AI 声明/邮件草稿 |

## 质量门禁（本地实跑结果）
- `tsc --noEmit`（strict + noUncheckedIndexedAccess）：**0 error**
- `eslint .`：**0 error**
- Vitest：**43/43 passed**（domain 19 + schema 3 + api 10 + flow 11）
- `next build`：**成功**，路由 `/`、`/assessment/[id]`、`/assessment/[id]/result`、`/recovery`、`/api/[[...route]]`
- Playwright：**2/2 passed**（desktop 27.4s / mobile 27.9s，真实 Neon）
- 依赖审计：0 high/critical；1 moderate（esbuild dev-server 提示，仅影响本地开发服务器，生产不暴露，可接受）

## 冻结算法口径回归（未被改动，单测钉死）
- 男 28/175/80→70 moderate：BMI 26.1 / BMR 1758.75 / TDEE 2726 / 摄入 2226 / 20–40 周 / 下限 56.66kg
- 女 24/162/65→58 light：BMI 24.8 / BMR 1381.5 / TDEE 1900 / 摄入 1400 / 14–28 周 / 下限 48.55kg
- 安全底线 女 1200 / 男 1500；缺口 500；0.5/0.25kg 每周向上取整；算法版本 mifflin-v1.0.0

## 仍需人工（账号侧，不可由代码完成）
1. GitHub 建仓并 push（CLI 未登录，见 DEPLOYMENT.md 第 3 节，二选一）。
2. Render Blueprint 选仓、填 `DATABASE_URL`（Neon 直连）与 `RECOVERY_HMAC_KEY`。
3. cron-job.org 每 10 分钟 ping `/api/health`。

## 已知边界（与冻结版一致，主动声明）
- 支付为**模拟**实现，不接真实第三方支付；
- 不做微服务拆分、不引入大模型产出健康数值、不做完整移动端 App；
- 免费实例会休眠，靠 cron 保活，冷启动约 30–60s。
