import type { NextConfig } from 'next';

// output: standalone —— Render 等标准 Node 平台只需 node server 启动（ADR-08）
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
