# AI 协作使用声明（诚实、可核查）

本项目由候选人主导设计与实现，使用 AI 编程助手（Doubao）作为结对工具。
为满足挑战对“AI 使用透明度”的要求，如实说明 AI 参与的边界：

## 一、候选人独立负责的部分
- 需求拆解、技术选型与架构决策（见 ADR-01..08，均由候选人确认后落档）；
- 业务规则与冻结口径：Mifflin-St Jeor 公式、安全底线、缺口与周数取整规则；
- 数据模型（九表）、状态机（会话/支付/恢复码）、错误码与幂等/限流策略；
- 所有关键逻辑的正确性判断、测试断言口径与验收标准；
- 代码逐行阅读、调试决策与最终合入。

## 二、AI 助手承担的部分
- 按候选人给定的契约与口径，生成样板代码、CRUD/路由、测试骨架与文档初稿；
- 报错排查：协助定位并解释以下环境/框架问题，修复方案由候选人确认：
  - pnpm 官方源超时（改用代理）、esbuild 构建脚本白名单；
  - TypeScript 7 与 typescript-eslint 不兼容（锁定 TS 5.9）；
  - Next 16 (Turbopack) 下数据库包 `instanceof Date` 跨 chunk 失效
    → `serverExternalPackages`；限流原生 `sql` 模板时间参数类型问题 → Drizzle `and/eq`；
  - Neon `-pooler`(PgBouncer) 与直连端点差异（最终采用直连）；
  - react-hook-form 跨步字段保留（`setValue` + `shouldUnregister:false`）。
- 文档润色、提交信息、部署手册与本声明的文字整理。

## 三、AI 没有替代的部分
- 没有用 AI 生成任何健康/医学结论；所有数值来自候选人冻结的确定性公式；
- 没有让 AI 自行决定安全、幂等、事务等关键正确性策略；
- 所有测试由真实代码运行得出，未编造结果（结果可通过 `pnpm verify` 复现）。

## 四、可复现性
- 全部命令、版本、迁移与测试均在仓库内；评审可按 README 一键复跑：
  `pnpm install && pnpm verify`，E2E：`pnpm build && pnpm test:e2e`。
- 三次提交（day1/day2/day3）保留完整演进历史，可逐 commit 审查。
