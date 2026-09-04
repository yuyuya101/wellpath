# 提交邮件草稿（按招聘方要求填写后发送）

**收件人**（四个邮箱都发，可放同一封的收件人/抄送）：jin@arkon-tech.com、bin@arkon-tech.com、alex@arkon-tech.com、rip@arkon-tech.com
**主题**（严格按要求格式）：【余伟林】_全栈挑战_20260903

---

您好：

我已完成本次全栈开发三天挑战，提交作品 **WellPath**（健康测评订阅漏斗），
现提交如下材料。

**一、在线地址**
- 演示地址：https://wellpa.netlify.app
- 健康检查：https://wellpa.netlify.app/api/health
- 代码仓库：https://github.com/yuyuya101/wellpath（如要求私有，可开放指定账号只读权限）
- 访问备注：站点托管于境外免费平台 Netlify，国内个别桌面宽带可能因 DNS 策略首次打开偏慢或失败，切换手机热点/移动网络或使用常规网络加速器即可正常访问；也可直接按下方「本地运行」clone 启动，效果与线上一致。

**二、本地运行**
```bash
pnpm install
pnpm verify            # typecheck + lint + 72 个单测/集成测试 + 构建
pnpm build && pnpm test:e2e   # 双视口端到端冒烟（需 .env，见 docs/DEPLOYMENT.md）
```

**三、完成情况（对照任务矩阵 T01–T23）**
- 三个里程碑 M1/M2/M3 全部达成，详见 `docs/ACCEPTANCE.md`；
- 测评体验：参考成熟健康类产品做了引导式问卷——3 个板块、13 屏分步收集，卡片/列表行/多选/数值多种题型与分段进度，响应式布局在桌面多列、手机自动单列；支持减重/维持/增重三种目标与三档节奏，目标值实时做医学安全区间校验；结果页免费版只给脱敏概览并逐项列出锁定字段，会员版给出大字号摄入目标、完整数据与确定性个性化建议，付费边界清晰；
- 自动化测试：Vitest 72 个（领域/契约/API/业务闭环，含减重·维持·增重三方向与节奏、分屏部分草稿合法但非法值拦截、增重 BMI25 上限、前端目标屏与服务端共用同一套 BMI18.5/25 健康边界即时拦截、提交期字段错误自动回跳定位、会员过期回退免费、锁定字段清单一致性、会员专属 AI 洞察的非会员 402 拦截/本地模型不可达兜底/生产环境不空等超时等权限与输入边界）+ Playwright 1 条用例 × 桌面/移动双视口，全部通过；
- CI：GitHub Actions 两个 Job——①typecheck/lint/Vitest(PGlite)/生产构建，②在真实 PostgreSQL 16 服务容器上跑 Drizzle 迁移，均通过（仓库 README 顶部有通过状态徽章）；
- 产品完整度：首页即给出「免费通道 / 会员通道」两个醒目入口与 /pricing 十项权益对比页；结果页升级走三步模拟结账（套餐→卡/PayPal→成功，卡号仅停留浏览器、真正授权只靠服务端幂等 /pay）；会员结果额外提供「AI 健康教练」——本地 Ollama/DeepSeek 基于已算好的数值生成自然语言建议，线上主机访问不到本机时自动回退确定性建议、绝不报错，健康数值始终只由确定性算法产出；界面配一套统一扁平风格插画并做响应式；
- 关键工程点：提交原子事务、乐观锁、字段级 DTO 脱敏、支付永久幂等、
  HMAC 单次恢复码、数据库限流、RFC 9457 错误码、安全响应头与同源策略；
- 接口契约：`docs/openapi.json`（OpenAPI 3.1）；
- 部署：Netlify + Neon 免费层（免信用卡，函数按需启动、无休眠保活），见 `docs/DEPLOYMENT_NETLIFY.md`。

**四、评审快速验证（付费前后差异化对比）**
- 已支付演示会话（样例：男 28/175cm/80kg→70kg/moderate，BMI 26.1 / BMR 1758.75 / TDEE 2726 / 摄入 2226；已在线验证付费前 access=free 且无保护字段、付费后 access=full）：
  - sessionId：`2d9b2844-e8a4-4474-88d7-e8b7b5743b76`，恢复码：`3mF-koWUV-Ce4NFYrBlNkcT2qRK2g-x7zXpXPmlErtA`
  - 备用 1：`f8192289-3392-4a70-821b-f49f2a90603a` / `TeZihYUllSWEIDBKlIK9Mh6HVxck3Z9UxgegwoIQCiE`
  - 备用 2：`38cf4d4f-fa25-4c2e-aad0-fb78fbf3c9cc` / `e68w9jM04_fg7R0ZOVWPRXiEO8PNhUyXPj2X9oE5dXs`
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
