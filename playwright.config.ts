import { defineConfig, devices } from '@playwright/test';

/**
 * T18：唯一一条端到端冒烟，双视口（桌面 + 移动）各跑一次。
 * webServer 启动生产构建（next start）；DATABASE_URL / RECOVERY_HMAC_KEY
 * 本地由 Next 自动读取 .env，CI 由 workflow 注入。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      // 仅装了 chromium：用移动视口/touch/UA，浏览器仍为 chromium
      use: { ...devices['iPhone 12'], browserName: 'chromium' },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node node_modules/next/dist/bin/next start -p 3100',
        url: 'http://localhost:3100/api/health',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
