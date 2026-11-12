'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import type { AllPathsResult, DegreesOk, DegreesResult } from './degrees-types';

export type { AllPathsResult, DegreesOk, DegreesResult, PathNode } from './degrees-types';

/**
 * Resolve the viewer's self-person id from their profile. Returns null if the
 * user hasn't completed the "Add yourself" onboarding.
 */
export async function getSelfPersonId(): Promise<string | null> {
  const userId = await getCachedLoggedInUserIdOrNull();
  if (!userId) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('linked_person_id, self_person_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const row = data as {
    linked_person_id: string | null;
    self_person_id: string | null;
  } | null;
  return row?.linked_person_id ?? row?.self_person_id ?? null;
}

export async function computeDegreesTo(targetPersonId: string): Promise<DegreesResult> {
  const selfId = await getSelfPersonId();
  if (!selfId || !targetPersonId || selfId === targetPersonId) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('compute_degrees', {
    p_source: selfId,
    p_target: targetPersonId,
  });
  if (error) {
    console.error('compute_degrees failed:', error.message);
    if (/42501|P0002|not.?found|permission|access/i.test(error.message)) {
      return null;
    }
    return { error: error.message };
  }
  if (!data) return null;
  return data as DegreesOk;
}

/** W3.3 / D12: up to N alternate connection paths (default 5). */
export async function computeAllPathsTo(
  targetPersonId: string,
  maxPaths = 5,
): Promise<AllPathsResult> {
  const selfId = await getSelfPersonId();
  if (!selfId || !targetPersonId || selfId === targetPersonId) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('compute_all_paths', {
    p_source: selfId,
    p_target: targetPersonId,
    p_max_paths: maxPaths,
  });
  if (error) {
    console.error('compute_all_paths failed:', error.message);
    if (/42501|P0002|not.?found|permission|access/i.test(error.message)) {
      return null;
    }
    return { paths: [], error: error.message };
  }
  if (!data) return null;
  return data as AllPathsResult;
}
