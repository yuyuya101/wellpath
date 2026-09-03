# ADR-04 数据库分层：PGlite 本地 / PG service CI / Neon 预览生产

- 状态：Accepted（3.1 冻结，P1-11 解决本地对 Docker 的依赖）

## 背景
本机无 Docker、无本地 PostgreSQL；要求零安装即可本地开发与测试，同时保证与生产 PG 行为一致。

## 决策
- 本地与 Vitest 单测/集成测试：@electric-sql/pglite（WASM 内嵌 PostgreSQL，零安装），每用例独立内存库并跑真实迁移。
- CI：GitHub Actions 用 postgres service container 跑同一套测试。
- 预览/生产：Neon Serverless PostgreSQL（SSL）。
- 数据库方言统一 PostgreSQL，仓储层通过依赖注入接收 db 句柄。

## 后果
本地无需 Docker；迁移 SQL 在三种环境一致执行，差异仅在连接方式。
