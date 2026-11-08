'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PathNode = {
  person_id: string;
  relation: 'self' | 'parent' | 'child' | 'spouse' | 'sibling';
  name_ar: string | null;
  name_en: string | null;
  gender: 'M' | 'F' | 'X' | 'U' | null;
};

export type DegreesResult = {
  degrees: number;
  path: PathNode[];
  cached?: boolean;
} | null;

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
    // Non-fatal: swallow to avoid breaking the result card.
    return null;
  }
  if (!data) return null;
  return data as DegreesResult;
}

export type AllPathsResult = {
  paths: Array<{ degrees: number; path: PathNode[] }>;
  max_paths?: number;
  note?: string;
} | null;

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
  if (error || !data) return null;
  return data as AllPathsResult;
}
