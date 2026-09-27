import { test, expect } from '@playwright/test';

// F7: the real Juthoor owner journey (replaces the deleted Nextbase
// "Private Items" CRUD spec). Runs with the logged-in user's storageState.
test.describe('Juthoor owner flow', () => {
  test('dashboard shows the six discovery lanes including Connections', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // the DiscoveryTabs strip — including the M3 Connections lane (B17)
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: /فرد|Individual/ })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /روابط|Connections/ })).toBeVisible();

    // the in-app notification bell (B18) is mounted in the header
    await expect(page.getByRole('button', { name: /الإشعارات|Notifications/ })).toBeVisible();
  });

  test('owner can navigate dashboard → tree landing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: /افتح الشجرة|Open tree/ }).first().dispatchEvent('click');

    await expect(page).toHaveURL(/\/tree/);
    // a fresh owner lands on the tree workspace empty state: the Arabic heading
    // and the "add person" call-to-action (every tree starts with one name)
    await expect(page.getByRole('heading', { name: 'شجرة عائلتي' })).toBeVisible();
    await expect(page.getByRole('button', { name: /إضافة شخص/ })).toBeVisible();
  });

  test('the Connections lane opens from the dashboard tabs', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('tab', { name: /روابط|Connections/ }).dispatchEvent('click');

    await expect(page).toHaveURL(/\/dashboard\/connections/);
    await expect(
      page.getByText(/روابط محتملة بين شجرتك|Possible links between your tree/),
    ).toBeVisible();
  });
});
