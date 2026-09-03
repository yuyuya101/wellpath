# 提交邮件草稿（按招聘方要求填写后发送）

**主题**：全栈开发 3 天挑战提交 — WellPath（余伟林 / 深圳大学）

---

您好：

我已完成本次全栈开发三天挑战，提交作品 **WellPath**（健康测评订阅漏斗），
现提交如下材料。

**一、在线地址**
- 演示地址：`<Render 部署后的 https://wellpath-xxxx.onrender.com>`（部署后回填）
- 健康检查：`<同上>/api/health`
- 代码仓库：`<GitHub 仓库地址>`（如要求私有，可开放指定账号只读权限）

**二、本地运行**
```bash
pnpm install
pnpm verify            # typecheck + lint + 43 个单测/集成测试 + 构建
pnpm build && pnpm test:e2e   # 双视口端到端冒烟（需 .env，见 docs/DEPLOYMENT.md）
```

**三、完成情况（对照任务矩阵 T01–T23）**
- 三个里程碑 M1/M2/M3 全部达成，详见 `docs/ACCEPTANCE.md`；
- 自动化测试：Vitest 43 个（领域/契约/API/业务闭环）+ Playwright 1 条用例 × 桌面/移动双视口，全部通过；
- CI：GitHub Actions 三个 Job（静态质量、真实 Postgres 迁移、Chromium E2E）；
- 关键工程点：提交原子事务、乐观锁、字段级 DTO 脱敏、支付永久幂等、
  HMAC 单次恢复码、数据库限流、RFC 9457 错误码、安全响应头与同源策略；
- 接口契约：`docs/openapi.json`（OpenAPI 3.1）；
- 部署：Render + Neon 免费层，cron-job.org 保活，免信用卡，见 `docs/DEPLOYMENT.md`。

**四、AI 使用声明**
按要求如实说明 AI 协作边界，见 `docs/AI_USAGE.md`：AI 仅作结对编程与文档辅助，
架构、业务规则、正确性策略与验收均由本人负责，所有结果可复现。

**五、已知边界（主动声明）**
支付为模拟实现，未接真实第三方；未做微服务拆分与完整移动端；
免费实例存在冷启动，已用定时健康检查保活。

如需补充材料或安排代码走查，我随时可以配合。谢谢！

此致
敬礼

余伟林
电话：`<填写>` ｜ 邮箱：2269037786@qq.com
2026-09-03
