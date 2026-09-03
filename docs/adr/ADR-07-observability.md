# ADR-07 可观测性：Pino + X-Request-Id

- 状态：Accepted（3.1 冻结）

## 决策
服务端用 Pino 输出结构化 JSON 日志；中间件为每个请求生成/透传 X-Request-Id 并写入响应头与日志上下文；/health 返回版本与数据库连通状态。Sentry 为可选项，通过环境变量启用。

## 后果
问题可按 request id 串联；免费层无额外成本，需要时再接 Sentry。
