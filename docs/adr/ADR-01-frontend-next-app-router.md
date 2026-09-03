# ADR-01 前端框架：Next.js App Router + React Hook Form

- 状态：Accepted（3.1 冻结）
- 日期：2026-09-03

## 背景
需要 SSR/RSC 承载营销与结果页、客户端承载多步问卷，要求一套技术栈同时覆盖页面、API 与部署，三天内交付。

## 决策
- Next.js App Router + TypeScript strict；页面默认 Server Component，问卷等交互用 Client Component。
- 表单用 React Hook Form（非受控、轻量、易分步），校验复用后端 Zod schema。

## 后果
- 一套仓库覆盖前后端，部署简单；RSC/Client 边界需在开发中保持清晰（数据获取不下沉到客户端）。
