# ADR-05 接口契约：Zod + zod-to-openapi

- 状态：Accepted（3.1 冻结）

## 决策
以 Zod 定义请求/响应 Schema 作为唯一契约源，前后端共享；错误统一 RFC9457（application/problem+json）。有余量时用 zod-to-openapi 生成本地 OpenAPI 文档，禁止手写脱节文档。

## 后果
类型与校验同源；错误结构稳定，前端可按 code/fieldErrors 精确渲染。
