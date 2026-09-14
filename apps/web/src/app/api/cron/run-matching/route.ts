import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Vercel-cron FALLBACK for the nightly shadow matcher (plan §6 Cron).
 *
 * pg_cron is the primary scheduler (see migration 20260712040000). This route
 * exists for environments where pg_cron cannot run and is NOT wired into
 * vercel.json by default — enabling both would be harmless (run_matching_batch
 * is advisory-locked, key 724242) but pointless. To enable: add a vercel.json
 * cron entry for GET /api/cron/run-matching and set CRON_SECRET +
 * SUPABASE_SERVICE_ROLE_KEY in the Vercel env (never in the repo).
 *
 * Contract (brief §6-F4): kick the batch, NEVER await it over HTTP — the
 * response returns 202 immediately and the batch runs post-response via
 * `after()` within this function's bounded lifetime. 501 when unconfigured.
 */
// NOTE: no `export const dynamic` — route-segment config is incompatible with
// nextConfig.cacheComponents, and handlers that read request headers are
// dynamic by default under it anyway.
export const maxDuration = 60;

function unauthorized(): NextResponse {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

async function handle(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET is not configured — fallback disabled' },
      { status: 501 },
    );
  }
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically.
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return unauthorized();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured — fallback disabled' },
      { status: 501 },
    );
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Fire-and-forget: respond 202 now; the kick runs after the response. The
  // advisory lock inside run_matching_batch makes a concurrent pg_cron run a
  // clean no-op (it returns NULL instead of double-running).
  after(async () => {
    try {
      const { error } = await supabase.rpc('run_matching_batch', { p_full: false });
      if (error) {
        console.error('[cron/run-matching] batch kick failed:', error.message);
        return;
      }
      const { error: drainError } = await supabase.rpc('drain_overlay_refresh');
      if (drainError) {
        console.error('[cron/run-matching] overlay drain failed:', drainError.message);
      }
    } catch (e) {
      console.error('[cron/run-matching] unexpected failure:', e);
    }
  });

  return NextResponse.json({ ok: true, kicked: 'run_matching_batch(false)' }, { status: 202 });
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
