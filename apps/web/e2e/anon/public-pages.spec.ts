import { expect, test } from '@playwright/test';

test.describe.parallel('Anonymous user public pages', () => {
  test('can access the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page).toHaveTitle(/جذور|Juthoor/);
  });

  test('login page shows Password + OTP tabs and no Magic Link', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('tab', { name: /Password|كلمة السر/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /OTP Code|رمز التحقق/i })).toBeVisible();
    // the Magic Link tab was removed — it must not reappear
    await expect(page.getByRole('tab', { name: /Magic Link|رابط سحري/i })).toHaveCount(0);
  });

  test('sign-up page shows the display-name + email fields', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page).toHaveURL(/\/sign-up/);
    await expect(page.locator('#display-name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });
});
