/** Social log-in providers the app has buttons for. */
export const SOCIAL_PROVIDERS = ['google', 'github', 'twitter'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000;

let cached: { providers: SocialProvider[]; expiresAt: number } | null = null;

/**
 * Picks the providers that a Supabase `/auth/v1/settings` response reports as
 * enabled. Anything that is not an explicit `true` counts as disabled.
 */
export function parseEnabledProviders(settings: unknown): SocialProvider[] {
  const external = (settings as { external?: unknown } | null)?.external;
  if (!external || typeof external !== 'object') return [];
  const flags = external as Record<string, unknown>;
  return SOCIAL_PROVIDERS.filter((provider) => flags[provider] === true);
}

/**
 * Social providers enabled on the Supabase project the app talks to, read from
 * its public auth settings. Successful answers are kept for a few minutes.
 * Fails closed: if the request fails or times out, no provider is offered.
 */
export async function getEnabledSocialProviders(): Promise<SocialProvider[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.providers;
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!response.ok) return [];
    const providers = parseEnabledProviders(await response.json());
    cached = { providers, expiresAt: Date.now() + CACHE_MS };
    return providers;
  } catch {
    return [];
  }
}
