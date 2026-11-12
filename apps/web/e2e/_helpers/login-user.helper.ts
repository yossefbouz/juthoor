import { type Page } from '@playwright/test';
import { getOtpCodeForAddress } from './inbucket';

/**
 * Log an EXISTING user in via the OTP tab on /login (the Magic-Link tab is gone).
 * Reads the code from Inbucket and types it into the segmented OtpCodeInput.
 * Most authenticated specs reuse the saved storageState instead of calling this;
 * it exists for specs that must exercise a fresh interactive login.
 */
export async function loginUserHelper({
  page,
  emailAddress,
}: {
  page: Page;
  emailAddress: string;
}): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('juthoor.locale', 'en');
  });
  await page.goto('/login');
  await page.getByRole('tab', { name: /OTP Code|رمز التحقق/i }).click();
  await page.locator('#otp-email').fill(emailAddress);
  await page.getByRole('button', { name: /Send .*code|أرسل الرمز/ }).click();

  const code = await getOtpCodeForAddress(emailAddress);
  await page.getByLabel('digit 1').waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < code.length; i++) {
    await page.getByLabel(`digit ${i + 1}`).fill(code[i]);
  }
  await page.getByRole('button', { name: /Verify & sign in|تحقّق وادخل/ }).click();

  await page.waitForURL(/dashboard/, { timeout: 30000 });
}
