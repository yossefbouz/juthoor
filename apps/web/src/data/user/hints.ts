'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import type { Json, MatchReviewCardRow, HintStatus } from '@/types/database';

export type ConnectionVerdict = 'agree' | 'disagree' | 'missing';
export type ConnectionField = { field: string; verdict: ConnectionVerdict };

export type ConnectionCard = {
  hintId: string;
  matchId: string;
  hintStatus: HintStatus;
  /** True when the engine linked this pair automatically; the owner can revoke it. */
  autoLinked: boolean;
  score: number;
  viewerPersonId: string;
  viewerNameAr: string | null;
  viewerNameEn: string | null;
  counterpartLabelAr: string;
  counterpartLabelEn: string;
  counterpartMasked: boolean;
  livingInvolved: boolean;
  fields: ConnectionField[];
  createdAt: string;
};

const FIELD_ORDER = [
  'given', 'surname', 'father', 'pgf', 'pgm',
  'mother', 'mgf', 'mgm', 'spouse',
  'origin', 'birth_year', 'birth_place', 'death_year', 'death_place', 'email', 'num_children',
] as const;

/** Turn the view's field_agreement jsonb into an ordered chip list (or []). */
function fieldsFromAgreement(agreement: Json | null): ConnectionField[] {
  if (!agreement || typeof agreement !== 'object' || Array.isArray(agreement)) return [];
  const obj = agreement as Record<string, unknown>;
  return FIELD_ORDER.filter((f) => f in obj).map((field) => {
    const v = obj[field];
    const verdict: ConnectionVerdict =
      v === 'agree' || v === 'disagree' ? v : 'missing';
    return { field, verdict };
  });
}

type HintRow = {
  id: string;
  match_id: string;
  counterpart_person_id: string;
  status: HintStatus;
  created_at: string;
};

/**
 * The current owner's deferred connections: their pending/decided `match_hints`
 * joined to the MASKED `match_review_cards` (the only owner read onto a match).
 * RLS scopes hints to `owner_user_id = auth.uid()`, and the view returns the
 * owner's own perspective with the counterparty masked.
 */
export async function listConnections(): Promise<ConnectionCard[]> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return [];
  const supabase = await createJuthoorSupabaseClient();

  const { data: hintData, error } = await supabase
    .from('match_hints')
    .select('id, match_id, counterpart_person_id, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load connections: ${error.message}`);
  const hints = (hintData ?? []) as HintRow[];
  if (hints.length === 0) return [];

  const matchIds = Array.from(new Set(hints.map((h) => h.match_id)));
  const { data: cardData } = await supabase
    .from('match_review_cards')
    .select('*')
    .in('match_id', matchIds);
  const cardByMatch = new Map(
    ((cardData ?? []) as MatchReviewCardRow[]).map((c) => [c.match_id, c]),
  );

  return hints.flatMap((h) => {
    const c = cardByMatch.get(h.match_id);
    if (!c) return [];
    return [
      {
        hintId: h.id,
        matchId: h.match_id,
        hintStatus: h.status,
        autoLinked: c.status === 'auto_merged',
        score: c.confidence_score,
        viewerPersonId: c.viewer_person_id,
        viewerNameAr: c.viewer_name_ar,
        viewerNameEn: c.viewer_name_en,
        counterpartLabelAr: c.counterpart_label_ar,
        counterpartLabelEn: c.counterpart_label_en,
        counterpartMasked: c.counterpart_masked,
        livingInvolved: c.living_involved,
        fields: fieldsFromAgreement(c.field_agreement),
        createdAt: h.created_at,
      },
    ];
  });
}

/** Count of connections still awaiting the owner's decision (for a tab badge). */
export async function countPendingConnections(): Promise<number> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return 0;
  const supabase = await createJuthoorSupabaseClient();
  const { count } = await supabase
    .from('match_hints')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

// ── owner decisions ──────────────────────────────────────────────────────────
const HintSchema = z.object({ hintId: z.string().uuid() });
const MatchSchema = z.object({ matchId: z.string().uuid() });

async function decideHint(hintId: string, accept: boolean): Promise<void> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase.rpc('resolve_match_hint', {
    p_hint_id: hintId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

/** Accept the owner's side. When BOTH owners accept, the link is confirmed. */
export async function acceptConnection(input: z.input<typeof HintSchema>): Promise<void> {
  await decideHint(HintSchema.parse(input).hintId, true);
}

/** Revoke a link the engine made automatically (undoes it for both trees). */
export async function revokeAutoLink(input: z.input<typeof MatchSchema>): Promise<void> {
  const { matchId } = MatchSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase.rpc('revoke_auto_link', { p_match_id: matchId });
  if (error) throw new Error(error.message);
}

/** Decline — silent to the counterpart (they are never told a side declined). */
export async function declineConnection(input: z.input<typeof HintSchema>): Promise<void> {
  await decideHint(HintSchema.parse(input).hintId, false);
}

// ── privacy hold: "do not match this person of mine across trees" ────────────
const HoldSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export async function setPrivacyHold(input: z.input<typeof HoldSchema>): Promise<void> {
  const parsed = HoldSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase.from('person_privacy_holds').upsert(
    { person_id: parsed.personId, set_by: uid, reason: parsed.reason ?? null },
    { onConflict: 'person_id' },
  );
  if (error) throw new Error(`Failed to set privacy hold: ${error.message}`);
}
