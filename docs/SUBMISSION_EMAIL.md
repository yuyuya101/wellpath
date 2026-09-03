# 提交邮件草稿（按招聘方要求填写后发送）

**主题**：全栈开发 3 天挑战提交 — WellPath（余伟林 / 深圳大学）

---

您好：

我已完成本次全栈开发三天挑战，提交作品 **WellPath**（健康测评订阅漏斗），
现提交如下材料。

**一、在线地址**
- 演示地址：https://wellpa.netlify.app
- 健康检查：https://wellpa.netlify.app/api/health
- 代码仓库：https://github.com/yuyuya101/wellpath（如要求私有，可开放指定账号只读权限）

**二、本地运行**
```bash
pnpm install
pnpm verify            # typecheck + lint + 58 个单测/集成测试 + 构建
pnpm build && pnpm test:e2e   # 双视口端到端冒烟（需 .env，见 docs/DEPLOYMENT.md）
```

**三、完成情况（对照任务矩阵 T01–T23）**
- 三个里程碑 M1/M2/M3 全部达成，详见 `docs/ACCEPTANCE.md`；
- 自动化测试：Vitest 58 个（领域/契约/API/业务闭环，含减重·维持·增重三方向与节奏、分屏部分草稿合法但非法值拦截、增重 BMI25 上限、会员过期回退免费、锁定字段清单一致性等权限与输入边界）+ Playwright 1 条用例 × 桌面/移动双视口，全部通过；
- CI：GitHub Actions 三个 Job（静态质量、真实 Postgres 迁移、Chromium E2E）；
- 关键工程点：提交原子事务、乐观锁、字段级 DTO 脱敏、支付永久幂等、
  HMAC 单次恢复码、数据库限流、RFC 9457 错误码、安全响应头与同源策略；
- 接口契约：`docs/openapi.json`（OpenAPI 3.1）；
- 部署：Netlify + Neon 免费层（免信用卡，函数按需启动、无休眠保活），见 `docs/DEPLOYMENT_NETLIFY.md`。

**四、评审快速验证（付费前后差异化对比）**
- 已支付演示会话（样例：男 28/175cm/80kg→70kg/moderate，BMI 26.1 / BMR 1758.75 / TDEE 2726 / 摄入 2226）：
  - sessionId：`f8192289-3392-4a70-821b-f49f2a90603a`，恢复码：`TeZihYUllSWEIDBKlIK9Mh6HVxck3Z9UxgegwoIQCiE`
  - 备用：`38cf4d4f-fa25-4c2e-aad0-fb78fbf3c9cc` / `e68w9jM04_fg7R0ZOVWPRXiEO8PNhUyXPj2X9oE5dXs`
  - 因访问基于 HttpOnly Cookie，无原始 Cookie 时用恢复码调 `POST /api/recovery/redeem`
    换取新 Cookie 后 `GET /api/assessments/{id}/result` 即见完整字段（恢复码单次有效，二次 401）；
- 完整可重放 cURL（创建→分步保存→提交→免费结果→幂等支付→完整结果→恢复码）见 README “Reproduce the funnel & payment with cURL”；
- 数据库 Schema 图（九表关系）见 `docs/DATABASE_SCHEMA.md`。

**五、AI 使用声明**
按要求如实说明 AI 协作边界，见 `docs/AI_USAGE.md`（含“我否决过的 AI/常规方案”一节）：
AI 仅作结对编程与文档辅助，架构、业务规则、正确性策略与验收均由本人负责，所有结果可复现。

**六、已知边界（主动声明）**
支付为模拟实现，未接真实第三方；未做微服务拆分与完整移动端；
免费层函数与 Neon 冷启动时首个请求可能略慢。

如需补充材料或安排代码走查，我随时可以配合。谢谢！

此致
敬礼

余伟林
电话：`<填写>` ｜ 邮箱：2269037786@qq.com
2026-09-03
