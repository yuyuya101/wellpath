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

## 五、我否决过的 AI / 常规方案（题目点名要求）
> 原则：AI 负责快速给出候选，工程师对“是否成立”负责。以下每一条都经过官方文档、
> 真实运行或测试反证后被我否决或改写，而不是照单全收。

1. **否决 Neon `-pooler`（PgBouncer）连接串，改用直连端点。**
   AI 与 Neon 控制台默认都推荐“Pooled connection string”（更适合 Serverless）。
   但实际迁移/会话在 prepared statement 与事务下报错；核对官方文档后确认本项目的
   Drizzle 会话用法与 pooler 模式不兼容，最终生产改用 direct（非 pooler）端点，问题消失。
   判断依据是“真实跑通迁移 + 事务测试”，而非控制台的默认推荐。

2. **否决 Next.js `output: 'standalone'`。**
   部署方案最初按 standalone + `node server` 设计（Render 常见做法）。但在当前 Next 16
   版本下与 `next start` 启动方式冲突、产物入口不一致；实测构建/启动后确认弊大于利，
   移除该选项，改用平台标准 `next start`，避免为了“看起来更专业”的打包方式引入不稳定。

3. **否决在 `package.json` 写 `pnpm.onlyBuiltDependencies`。**
   pnpm 11.25 拦截 esbuild 构建脚本导致 CI 安装失败。AI 先建议在 package.json 加 pnpm
   字段，但 pnpm 11 已不再读取该字段并告警；以 `pnpm install` 真实输出为准，改到
   `pnpm-workspace.yaml` 的 `onlyBuiltDependencies / allowBuilds`，才真正生效。

4. **否决“内存限流计数器”，坚持落数据库固定窗口。**
   AI 曾给过进程内 Map 计数的最简实现，开发机好用。但 Serverless/多实例下内存不共享、
   形同虚设，与 3.1 冻结的“限流是跨实例安全承诺”相悖，最终实现为 Postgres 固定窗口
   （`rate_counter`），并补了第 11 次创建返回 429 的测试。

5. **否决“前端隐藏付费字段”的省事做法，坚持服务端 DTO 物理脱敏。**
   常见做法是接口返回全量、前端不渲染。但这等于把保护字段直接发给了浏览器；改为服务端
   按字段权益表组装 DTO，并在集成测试里对**序列化后的 JSON 字符串**断言不存在
   `bmr/tdee/recommendedIntake` 键，从根上保证非会员拿不到。

6. **部署平台连续否决 Vercel / Render / Koyeb，最终定 Netlify。**
   不因为“教程多”就硬上：Vercel 注册受阻；Render 免费层被风控要求绑信用卡、银联借记卡
   无法通过 Stripe；Koyeb 被收购后取消免费层。逐一核实官方当前政策后才换到 Netlify
   （$0、免信用卡、OpenNext 原生支持 App Router / Route Handler），并留下
   `docs/DEPLOYMENT_NETLIFY.md` 与弃用平台说明，避免后来者重走弯路。
7. **否决“线上服务器同步等待用户本机大模型”的天真接法。** 接入本地 DeepSeek（Ollama）
   做会员 AI 建议时，直觉写法是部署后也照常请求 `127.0.0.1:11434`。我判断线上主机永远
   访问不到评审者/用户的笔记本，一旦连接被静默丢弃，会员结果页会空等一个完整超时（数十秒），
   体验不可接受。因此改为：仅本地开发或显式配置 `OLLAMA_BASE_URL` 时才请求本地模型，生产
   环境直接回退确定性规则建议并标注来源，保证毫秒返回、永不硬失败；同时坚持“健康数值只由
   确定性算法产出，LLM 只负责自然语言表达”，并补了非会员 402、模型不可达兜底、生产不发请求
   三个回归测试。另外第一版让兜底建议与既有规则建议重复展示，自审时也主动改掉。

