# ADR-03 ORM：Drizzle

- 状态：Accepted（3.1 冻结）

## 背景
需要轻量、SQL 可读、Schema 即类型、与 serverless/Neon 冷启动匹配的 ORM。

## 决策
使用 Drizzle ORM + drizzle-kit 管理迁移；迁移 SQL 入库可审查，生产不依赖运行时 push。

## 后果
类型从 schema 推导，仓储层类型安全；迁移文件可 code review，符合业务交付标准。
