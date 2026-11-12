'use server';

import { z } from 'zod';
import { isPerfectMatchEligible } from '@/lib/matching/perfectMatch';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { requireAdmin } from '@/data/admin/requireAdmin';
import type { Json } from '@/types/database';

// ── types ────────────────────────────────────────────────────────────────────
export type FieldVerdict = 'agree' | 'disagree' | 'missing';
export type ReviewDecision = 'approve' | 'reject' | 'defer';

export type ReviewPerson = {
  id: string;
  displayNameAr: string | null;
  displayNameEn: string | null;
  treeName: string | null;
  isLiving: boolean;
};

export type ReviewField = { field: string; verdict: FieldVerdict; weight: number };

export type ReviewCard = {
  matchId: string;
  score: number;
  scorePct: number | null;
  status: string;
  /** the engine's own recommendation (meta.decision): 'auto_link' | 'review' */
  decision: string | null;
  livingInvolved: boolean;
  vetoes: string[];
  personA: ReviewPerson;
  personB: ReviewPerson;
  fields: ReviewField[];
  createdAt: string;
  /** D8: true when a perfect-match identifier hit lacks required UNRWA evidence. */
  perfectMatchBlocked: boolean;
};

// ── breakdown → per-field agree/disagree/missing (mirrors SQL match_field_agreement) ──
type Breakdown = {
  meta?: {
    score?: number;
    score_pct?: number;
    decision?: string;
    vetoes?: string[];
    privacy?: string | null;
    perfect_match?: boolean;
    identifier_match?: string | null;
    identifier_evidence?: boolean;
  };
  params?: Record<string, { w?: number; pts?: number }>;
};

/** The disagreement veto marker(s) that flip a zero-points field to 'disagree'. */
const DISAGREE_MARKERS: Record<string, readonly string[]> = {
  mother: ['mother_disagree'],
  spouse_first: ['spouse_disagree'],
  spouse_family: ['spouse_disagree'],
  spouse: ['spouse_disagree'],
  origin: ['origin_disagree'],
  mgf: ['mgp_disagree'],
  birth_year: ['birth_year_disagree', 'birth_year_gap'],
};

/** Stable display order for the chips (AIO-100: patriline → maternal → spouse → anchors). */
const FIELD_ORDER = [
  'given', 'surname', 'father', 'pgf',
  'mother', 'mgf', 'spouse_first', 'spouse_family',
  'origin', 'birth_year', 'birth_place', 'death_year', 'death_place', 'num_children',
] as const;

function deriveFields(bd: Breakdown): ReviewField[] {
  const params = bd.params ?? {};
  const vetoes = bd.meta?.vetoes ?? [];
  const keys = FIELD_ORDER.filter((k) => k in params);
  return keys.map((field) => {
    const pts = Number(params[field]?.pts ?? 0);
    const weight = Number(params[field]?.w ?? 0);
    let verdict: FieldVerdict;
    if (pts > 0) verdict = 'agree';
    else if ((DISAGREE_MARKERS[field] ?? []).some((m) => vetoes.includes(m))) verdict = 'disagree';
    else verdict = 'missing';
    return { field, verdict, weight };
  });
}

function parseBreakdown(raw: Json | null): Breakdown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Breakdown;
}

// ── list the admin review queue ──────────────────────────────────────────────
type MatchRow = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  confidence_score: number;
  status: string;
  score_breakdown: Json | null;
  created_at: string;
};
type PersonRow = {
  id: string;
  display_name_ar: string | null;
  display_name_en: string | null;
  tree_id: string;
  is_living: boolean | null;
};

/**
 * Pending + deferred matches, highest score first, as masked review cards.
 * Admin-only (RLS admits an admin to read `matches`/`persons` across trees).
 * `score_breakdown` carries no raw counterparty values — only points/state — so
 * the per-field chips reveal agreement, never the other tree's data.
 */
export async function listReviewQueue(input?: {
  limit?: number;
  offset?: number;
}): Promise<ReviewCard[]> {
  await requireAdmin();
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
  const offset = Math.max(input?.offset ?? 0, 0);
  const supabase = await createJuthoorSupabaseClient();

  const { data: matchData, error } = await supabase
    .from('matches')
    .select('id, person_a_id, person_b_id, confidence_score, status, score_breakdown, created_at')
    .in('status', ['pending', 'deferred'])
    .order('confidence_score', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Failed to load review queue: ${error.message}`);
  const matches = (matchData ?? []) as MatchRow[];
  if (matches.length === 0) return [];

  const personIds = Array.from(
    new Set(matches.flatMap((m) => [m.person_a_id, m.person_b_id])),
  );
  const { data: personData } = await supabase
    .from('persons')
    .select('id, display_name_ar, display_name_en, tree_id, is_living')
    .in('id', personIds);
  const persons = (personData ?? []) as PersonRow[];
  const personById = new Map(persons.map((p) => [p.id, p]));

  const treeIds = Array.from(new Set(persons.map((p) => p.tree_id)));
  const { data: treeData } = await supabase.from('trees').select('id, name').in('id', treeIds);
  const treeNameById = new Map(
    ((treeData ?? []) as Array<{ id: string; name: string | null }>).map((t) => [t.id, t.name]),
  );

  const toPerson = (id: string): ReviewPerson => {
    const p = personById.get(id);
    return {
      id,
      displayNameAr: p?.display_name_ar ?? null,
      displayNameEn: p?.display_name_en ?? null,
      treeName: p ? treeNameById.get(p.tree_id) ?? null : null,
      isLiving: Boolean(p?.is_living),
    };
  };

  return matches.map((m) => {
    const bd = parseBreakdown(m.score_breakdown);
    const a = toPerson(m.person_a_id);
    const b = toPerson(m.person_b_id);
    return {
      matchId: m.id,
      score: m.confidence_score,
      scorePct: bd.meta?.score_pct ?? null,
      status: m.status,
      decision: bd.meta?.decision ?? null,
      livingInvolved: bd.meta?.privacy === 'living_suppressed' || a.isLiving || b.isLiving,
      vetoes: bd.meta?.vetoes ?? [],
      personA: a,
      personB: b,
      fields: deriveFields(bd),
      createdAt: m.created_at,
      perfectMatchBlocked: Boolean(bd.meta?.perfect_match) && !isPerfectMatchEligible(bd),
    };
  });
}

// ── live re-derive a single card via score_pair (features may have changed) ──
export type RescoreResult = {
  score: number;
  scorePct: number | null;
  decision: string | null;
  vetoes: string[];
  livingInvolved: boolean;
  fields: ReviewField[];
};

export async function rescoreMatch(matchId: string): Promise<RescoreResult> {
  await requireAdmin();
  const supabase = await createJuthoorSupabaseClient();
  const { data: m } = await supabase
    .from('matches')
    .select('person_a_id, person_b_id')
    .eq('id', matchId)
    .maybeSingle();
  const match = m as { person_a_id: string; person_b_id: string } | null;
  if (!match) throw new Error('Match not found');

  const { data, error } = await supabase.rpc('score_pair', {
    p_a: match.person_a_id,
    p_b: match.person_b_id,
  });
  if (error) throw new Error(`Re-scoring failed: ${error.message}`);
  const row = (data ?? [])[0] as { score: number; breakdown: Json } | undefined;
  const bd = parseBreakdown(row?.breakdown ?? null);
  return {
    score: row?.score ?? 0,
    scorePct: bd.meta?.score_pct ?? null,
    decision: bd.meta?.decision ?? null,
    vetoes: bd.meta?.vetoes ?? [],
    livingInvolved: bd.meta?.privacy === 'living_suppressed',
    fields: deriveFields(bd),
  };
}

// ── the admin decision ───────────────────────────────────────────────────────
const ResolveSchema = z.object({
  matchId: z.string().uuid(),
  decision: z.enum(['approve', 'reject', 'defer']),
  note: z.string().trim().max(2000).optional(),
});

export async function resolveMatchAction(input: z.input<typeof ResolveSchema>): Promise<void> {
  const parsed = ResolveSchema.parse(input);
  await requireAdmin();
  const supabase = await createJuthoorSupabaseClient();
  const { error } = await supabase.rpc('resolve_match', {
    p_match_id: parsed.matchId,
    p_decision: parsed.decision,
    p_note: parsed.note ?? null,
  });
  if (error) throw new Error(error.message);
}
