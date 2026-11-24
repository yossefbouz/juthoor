import { test, expect } from '@playwright/test';

// Runs with the saved storageState of the e2e user (English locale). It opens
// the tour through the replay link, so it passes whether or not this user has
// already dismissed the first-run tour.
test.describe('Onboarding tour', () => {
  test('replays from the link, steps forward, and stays closed after Esc', async ({ page }) => {
    await page.goto('/dashboard?tour=1');
    const tour = page.getByTestId('onboarding-tour');
    await expect(tour).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/); // ?tour=1 is dropped
    await expect(tour).toContainText('Step 1 of');

    await tour.getByRole('button', { name: 'Next' }).click();
    await expect(tour).toContainText('Step 2 of');
    await expect(tour.getByRole('link', { name: 'Take me there' })).toHaveAttribute('href', '/tree');

    await page.keyboard.press('Escape');
    await expect(tour).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByTestId('onboarding-tour')).toBeHidden();
  });
});
