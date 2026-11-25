'use server';
import {
  SOCIAL_PROVIDERS,
  getEnabledSocialProviders,
} from '@/lib/auth/socialProviders';
import { actionClient } from '@/lib/safe-action';
import { createSupabaseClient } from '@/supabase-clients/server';
import { toSiteURL } from '@/utils/helpers';
import { z } from 'zod';

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Signs in a user with email and password.
 * @param {Object} params - The parameters for sign in.
 * @param {string} params.email - The user's email address.
 * @param {string} params.password - The user's password.
 * @throws {Error} If there's an error during sign in.
 */
export const signInWithPasswordAction = actionClient
  .schema(signInSchema)
  .action(async ({ parsedInput: { email, password } }) => {
    const supabase = await createSupabaseClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    // No need to return anything if the operation is successful
  });

const signInWithProviderSchema = z.object({
  provider: z.enum(SOCIAL_PROVIDERS),
  next: z.string().optional(),
});

/**
 * Initiates OAuth sign in with a specified provider.
 * @param {Object} params - The parameters for OAuth sign in.
 * @param {('google'|'github'|'gitlab'|'bitbucket')} params.provider - The OAuth provider.
 * @param {string} [params.next] - The URL to redirect to after successful sign in.
 * @returns {Promise<{url: string}>} The URL to redirect the user to for OAuth sign in.
 * @throws {Error} If there's an error initiating OAuth sign in.
 */
export const signInWithProviderAction = actionClient
  .schema(signInWithProviderSchema)
  .action(async ({ parsedInput: { provider, next } }) => {
    // A disabled provider would send the user to a raw Supabase error page.
    if (!(await getEnabledSocialProviders()).includes(provider)) {
      throw new Error(`Social provider "${provider}" is not enabled`);
    }
    const supabase = await createSupabaseClient();
    const redirectToURL = new URL(toSiteURL('/auth/callback'));
    if (next) {
      redirectToURL.searchParams.set('next', next);
    }
    const { error, data } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectToURL.toString(),
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return { url: data.url };
  });

// ─────────────── 6-digit OTP code via email (Step 6) ───────────────
//
// Two-step flow:
//   1. `requestEmailOtpAction({ email, mode: 'signup' | 'login' })` → Supabase
//      sends an email containing a 6-digit code. We do NOT pass
//      `emailRedirectTo` so the email template falls back to the {{ .Token }}
//      block instead of the magic-link block.
//   2. `verifyEmailOtpAction({ email, token })` → exchanges code for a session.
//      On success the session cookie is set automatically and the caller can
//      `router.push('/dashboard')`.

const requestEmailOtpSchema = z.object({
  email: z.string().email(),
  mode: z.enum(['signup', 'login']).default('signup'),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export const requestEmailOtpAction = actionClient
  .schema(requestEmailOtpSchema)
  .action(async ({ parsedInput: { email, mode, displayName } }) => {
    const supabase = await createSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: mode === 'signup',
        // Only stash display_name on first sign-up; do not pass during login.
        data: mode === 'signup' && displayName ? { display_name: displayName } : undefined,
      },
    });
    if (error) throw new Error(error.message);
  });

const verifyEmailOtpSchema = z.object({
  email: z.string().email(),
  // Supabase otp_length is configurable (hosted Juthoor uses 8, local
  // stack defaults to 6) — accept the whole range so an env mismatch
  // never locks users out at the validation layer.
  token: z.string().regex(/^\d{6,8}$/, 'يلزم رمز من 6 إلى 8 أرقام · A 6–8 digit code is required'),
});

export const verifyEmailOtpAction = actionClient
  .schema(verifyEmailOtpSchema)
  .action(async ({ parsedInput: { email, token } }) => {
    const supabase = await createSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw new Error(error.message);
  });

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

/**
 * Initiates the password reset process for a user.
 * @param {Object} params - The parameters for password reset.
 * @param {string} params.email - The email address of the user requesting password reset.
 * @throws {Error} If there's an error initiating the password reset.
 */
export const resetPasswordAction = actionClient
  .schema(resetPasswordSchema)
  .action(async ({ parsedInput: { email } }) => {
    const supabase = await createSupabaseClient();
    const redirectToURL = new URL(toSiteURL('/auth/callback'));
    redirectToURL.searchParams.set('next', '/update-password');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectToURL.toString(),
    });

    if (error) {
      throw new Error(error.message);
    }

    // No need to return anything if the operation is successful
  });
