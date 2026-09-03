import { test, expect } from '@playwright/test';

/**
 * 唯一一条端到端冒烟（T18）：免费漏斗 -> 模拟支付 -> 解锁完整结果。
 * 在 desktop / mobile 两个 project（视口）下各执行一次。
 */
test('funnel: start -> 4-step assessment -> free summary -> unlock -> full result', async ({ page }) => {
  // 首页
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /start free assessment/i }).click();

  // Step 1 basics
  await page.getByRole('radio', { name: /^male$/i }).click();
  await page.getByLabel('Age in years').fill('28');
  await page.getByLabel('Height').fill('175');
  await page.getByLabel('Current weight').fill('80');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2 goal
  await page.getByLabel('Target weight').fill('70');
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3 activity
  await page.getByRole('radio', { name: /moderate/i }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4 condition -> submit
  await page.getByRole('button', { name: /see my result/i }).click();

  // 免费摘要：不含完整数值
  await expect(page.getByRole('heading', { name: /free summary/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /unlock your full plan/i })).toBeVisible();

  // 模拟支付解锁
  await page.getByRole('button', { name: /unlock now/i }).click();

  // 完整结果：冻结口径男28/175/80->70 moderate 摄入 2226
  await expect(page.getByRole('heading', { name: /your full plan/i })).toBeVisible();
  await expect(page.getByText('2226 kcal/day')).toBeVisible();
  // 恢复码仅展示一次
  await expect(page.getByRole('heading', { name: /save your recovery code/i })).toBeVisible();
});
