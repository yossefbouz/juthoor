import { test as setup, expect, request } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const authFile = 'playwright/.auth/user_1.json';

/** Read API_URL + SERVICE_ROLE_KEY from the running local stack. */
function localSupabase(): { apiUrl: string; serviceKey: string } {
  const databaseDir = path.resolve(__dirname, '..', '..', '..', 'database');
  const out = execSync('pnpm exec supabase status --output env', {
    cwd: databaseDir,
    encoding: 'utf-8',
  });
  const env: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)="(.+)"$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.API_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error('[setup] Could not read API_URL / SERVICE_ROLE_KEY from supabase status');
  }
  return { apiUrl: env.API_URL, serviceKey: env.SERVICE_ROLE_KEY };
}

/**
 * Create a confirmed, non-admin test user via the admin API (no email round-trip —
 * local Mailpit sends a magic-link email, not a clean OTP, so UI OTP signup is
 * unreliable in CI), then log in through the real Password tab and persist the
 * session as storageState for the logged-in-users project.
 */
setup('create test user', async ({ page }) => {
  const email = `e2e_${Date.now()}@example.com`;
  const password = 'E2e-Test-Passw0rd!';
  const { apiUrl, serviceKey } = localSupabase();

  const ctx = await request.newContext();
  const res = await ctx.post(`${apiUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    data: { email, password, email_confirm: true },
  });
  if (!res.ok()) {
    throw new Error(`[setup] admin create-user failed: ${res.status()} ${await res.text()}`);
  }
  const userId = ((await res.json()) as { id: string }).id;
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

  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  await page.evaluate(() => window.localStorage.setItem('juthoor.locale', 'en'));
  await page.context().storageState({ path: authFile });
  // persist the uid so owner-facing specs can seed data owned by this user
  fs.writeFileSync(path.join(authDir, 'user_1.meta.json'), JSON.stringify({ userId, email }));
});
