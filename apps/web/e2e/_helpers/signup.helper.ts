import { type Page } from '@playwright/test';
import { getOtpCodeForAddress } from './inbucket';

/**
 * Sign up a fresh user through the REAL Juthoor UI: /sign-up collects a display
 * name + email + consent, sends an OTP, and we read the code from Inbucket and
 * enter it into the segmented OtpCodeInput. Local signup auto-confirms, so this
 * lands on /dashboard logged in. (The removed Magic-Link tab is gone.)
 */
export async function signupUserHelper({
  page,
  emailAddress,
  displayName = 'E2E Tester',
}: {
  page: Page;
  emailAddress: string;
  displayName?: string;
}): Promise<void> {
  // the OTP cells are looked up by their English label ("digit N") below
  await page.addInitScript(() => {
    window.localStorage.setItem('juthoor.locale', 'en');
  });
  await page.goto('/sign-up');
  await page.locator('#display-name').fill(displayName);
  await page.locator('#email').fill(emailAddress);

  // the consent checkbox gates the submit button
  const consent = page.locator('input[type="checkbox"]').first();
  if (await consent.count()) {
    await consent.check().catch(() => undefined);
  }

  await page.getByRole('button', { name: /Send code|أرسل الرمز/ }).click();

  // segmented OTP entry — cells carry aria-label "digit N"; fill each explicitly
  // (a controlled maxLength=1 input needs a real value set per cell to fire the
  // onChange that advances focus and, on the last cell, auto-submits).
  const code = await getOtpCodeForAddress(emailAddress);
  await page.getByLabel('digit 1').waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < code.length; i++) {
    await page.getByLabel(`digit ${i + 1}`).fill(code[i]);
  }
  // local sends a 6-digit code into an 8-cell input, so onComplete won't auto-fire;
  // the app accepts 6–8 digits via the manual verify button (brief §3).
  await page.getByRole('button', { name: /Verify & sign in|تحقّق وادخل/ }).click();

  await page.waitForURL(/dashboard/, { timeout: 30000 });
}
