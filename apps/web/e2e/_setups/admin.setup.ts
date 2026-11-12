import { test as setup, expect, request } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { localStack, serviceHeaders } from '../_helpers/localStack';

const authFile = 'playwright/.auth/admin.json';

/** Create a confirmed ADMIN user (admin API + profiles.is_admin=true), log in via
 *  the Password tab, and persist the session for the admin-users project. */
setup('create admin user', async ({ page }) => {
  const email = `e2e_admin_${Date.now()}@example.com`;
  const password = 'E2e-Admin-Passw0rd!';
  const { apiUrl, serviceKey } = localStack();
  const headers = serviceHeaders(serviceKey);

  const ctx = await request.newContext();
  const createRes = await ctx.post(`${apiUrl}/auth/v1/admin/users`, {
    headers,
    data: { email, password, email_confirm: true },
  });
  if (!createRes.ok()) {
    throw new Error(`[admin-setup] create-user: ${createRes.status()} ${await createRes.text()}`);
  }
  const uid = ((await createRes.json()) as { id: string }).id;

  // the on_auth_user_created trigger already made the profiles row — elevate it
  const patchRes = await ctx.patch(`${apiUrl}/rest/v1/profiles?id=eq.${uid}`, {
    headers: { ...headers, Prefer: 'return=minimal' },
    data: { is_admin: true },
  });
  if (!patchRes.ok()) {
    throw new Error(`[admin-setup] elevate: ${patchRes.status()} ${await patchRes.text()}`);
  }
  await ctx.dispose();

  await page.addInitScript(() => {
    window.localStorage.setItem('juthoor.locale', 'en');
  });
  await page.goto('/login');
  await page.getByRole('tab', { name: /Password|كلمة السر/i }).click();
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(password);
  await page.getByRole('button', { name: /^Login$|تسجيل الدخول/ }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });

  const dir = path.dirname(authFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.localStorage.setItem('juthoor.locale', 'en'));
  await page.context().storageState({ path: authFile });
});
