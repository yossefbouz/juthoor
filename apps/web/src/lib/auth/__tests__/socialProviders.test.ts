import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnabledProviders } from '../socialProviders';

const ALL_DISABLED = {
  external: { google: false, github: false, twitter: false, email: true },
  disable_signup: false,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('parseEnabledProviders', () => {
  it('returns nothing when every provider is disabled', () => {
    expect(parseEnabledProviders(ALL_DISABLED)).toEqual([]);
  });

  it('returns exactly the enabled providers the app has buttons for', () => {
    expect(
      parseEnabledProviders({
        external: { google: true, github: false, twitter: true, apple: true, email: true },
      })
    ).toEqual(['google', 'twitter']);
  });

  it('treats anything that is not an explicit true as disabled', () => {
    expect(
      parseEnabledProviders({ external: { google: 'true', github: 1, twitter: null } })
    ).toEqual([]);
  });

  it('returns nothing for a malformed body', () => {
    for (const body of [null, undefined, 'oops', 42, [], {}, { external: null }, { external: 'x' }]) {
      expect(parseEnabledProviders(body)).toEqual([]);
    }
  });
});

describe('getEnabledSocialProviders', () => {
  const fetchMock = vi.fn();

  // The module keeps a cache, so every test loads a fresh copy.
  async function load() {
    return (await import('../socialProviders')).getEnabledSocialProviders;
  }

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks the project auth settings with the publishable key and a timeout', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_DISABLED));
    await (await load())();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://project.example/auth/v1/settings');
    expect(init.headers).toEqual({ apikey: 'publishable-key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns no providers when all are disabled', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ALL_DISABLED));
    expect(await (await load())()).toEqual([]);
  });

  it('returns exactly the enabled providers', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ external: { google: true, github: true, twitter: false } })
    );
    expect(await (await load())()).toEqual(['google', 'github']);
  });

  it('fails closed when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await (await load())()).toEqual([]);
  });

  it('fails closed when the request times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await (await load())()).toEqual([]);
  });

  it('gives up on a request that never answers', async () => {
    // Like a hung connection: this fetch only ends when its signal aborts.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })
    );
    const startedAt = Date.now();
    expect(await (await load())()).toEqual([]);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  }, 10_000);

  it('fails closed on an error status, even if the body lists providers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ external: { google: true } }, 500));
    expect(await (await load())()).toEqual([]);
  });

  it('fails closed when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 200 }));
    expect(await (await load())()).toEqual([]);
  });

  it('keeps a successful answer for a few minutes, then asks again', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ external: { google: true } }));
    const getEnabledSocialProviders = await load();

    expect(await getEnabledSocialProviders()).toEqual(['google']);
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(await getEnabledSocialProviders()).toEqual(['google']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(jsonResponse(ALL_DISABLED));
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await getEnabledSocialProviders()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failure: the next call asks again', async () => {
    const getEnabledSocialProviders = await load();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await getEnabledSocialProviders()).toEqual([]);

    fetchMock.mockResolvedValue(jsonResponse({ external: { github: true } }));
    expect(await getEnabledSocialProviders()).toEqual(['github']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops offering providers when a later refresh fails', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(jsonResponse({ external: { google: true } }));
    const getEnabledSocialProviders = await load();
    expect(await getEnabledSocialProviders()).toEqual(['google']);

    vi.advanceTimersByTime(6 * 60 * 1000);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await getEnabledSocialProviders()).toEqual([]);
  });
});
