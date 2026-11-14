import { test, expect } from '@playwright/test';

// Group A9 / D9: Platform Admin can open and use the villages admin screen.
test.describe('Admin villages (Group A9)', () => {
  test('admin can open /admin/villages and see the editor', async ({ page }) => {
    await page.goto('/admin/villages');
    await expect(page).toHaveURL(/\/admin\/villages/);
    await expect(
      page.getByRole('heading', { name: /Villages & places|إدارة القرى والمدن/ }),
    ).toBeVisible();
    await expect(page.getByPlaceholder(/Arabic name|الاسم بالعربية/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Save$|^حفظ$/ })).toBeVisible();
  });

  test('non-admin path stays hidden (404 content)', async ({ browser }) => {
    // Fresh context without admin storage — use anon locale state.
    const context = await browser.newContext({
      storageState: 'playwright/locale-en.json',
    });
    const page = await context.newPage();
    await page.goto('/admin/villages');
    await expect(
      page.getByRole('heading', { name: /Villages & places|إدارة القرى والمدن/ }),
    ).toHaveCount(0);
    await context.close();
  });
});
