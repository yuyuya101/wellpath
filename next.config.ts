import type { NextConfig } from 'next';

// Render 等标准 Node 平台使用 `next build` + `next start` 启动（ADR-08）。
// serverExternalPackages：数据库驱动/ORM 保持原生 Node resolve（不打进 Turbopack chunk），
// 避免跨 chunk realm 导致 instanceof Date 失效（drizzle PgTimestamp / postgres-js 编码）。
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['postgres', 'drizzle-orm', '@electric-sql/pglite'],
  // T21 基础安全响应头
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
