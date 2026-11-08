'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PersonDisplacement = {
  person_id: string;
  unrwa_registration_number: string | null;
  family_card_1948_number: string | null;
  host_country_first: string | null;
  host_country_current: string | null;
  refugee_status: string | null;
  camp_name: string | null;
  displacement_year: number | null;
  displacement_wave: string | null;
  land_property_notes: string | null;
  oral_history: string | null;
  oral_history_provenance: string | null;
};

const DISPLACEMENT_COLS =
  'person_id, unrwa_registration_number, family_card_1948_number, host_country_first, host_country_current, refugee_status, camp_name, displacement_year, displacement_wave, land_property_notes, oral_history, oral_history_provenance';

export async function loadPersonDisplacement(
  personId: string,
): Promise<PersonDisplacement | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_displacement')
    .select(DISPLACEMENT_COLS)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) return null;

  const row = (data as PersonDisplacement | null) ?? null;

  // Identifiers may have been entered via AddPersonForm without a displacement
  // row. Merge so the panel does not show blank then wipe on save.
  const { data: ids } = await supabase
    .from('person_identifiers')
    .select('id_type, id_value')
    .eq('person_id', personId)
    .in('id_type', ['unrwa_registration', 'family_card_1948']);
  const idMap = new Map(
    ((ids ?? []) as Array<{ id_type: string; id_value: string }>).map((r) => [
      r.id_type,
      r.id_value,
    ]),
  );
  const unrwa = row?.unrwa_registration_number ?? idMap.get('unrwa_registration') ?? null;
  const card = row?.family_card_1948_number ?? idMap.get('family_card_1948') ?? null;

  if (!row && !unrwa && !card) return null;

  return {
    person_id: personId,
    unrwa_registration_number: unrwa,
    family_card_1948_number: card,
    host_country_first: row?.host_country_first ?? null,
    host_country_current: row?.host_country_current ?? null,
    refugee_status: row?.refugee_status ?? null,
    camp_name: row?.camp_name ?? null,
    displacement_year: row?.displacement_year ?? null,
    displacement_wave: row?.displacement_wave ?? null,
    land_property_notes: row?.land_property_notes ?? null,
    oral_history: row?.oral_history ?? null,
    oral_history_provenance: row?.oral_history_provenance ?? null,
  };
}

const SaveSchema = z.object({
  personId: z.string().uuid(),
  unrwaRegistrationNumber: z.string().trim().max(120).nullable().optional(),
  familyCard1948Number: z.string().trim().max(120).nullable().optional(),
  hostCountryFirst: z.string().trim().max(120).nullable().optional(),
  hostCountryCurrent: z.string().trim().max(120).nullable().optional(),
  refugeeStatus: z.string().trim().max(120).nullable().optional(),
  campName: z.string().trim().max(120).nullable().optional(),
  displacementYear: z.number().int().min(1900).max(2100).nullable().optional(),
  displacementWave: z.string().trim().max(120).nullable().optional(),
  landPropertyNotes: z.string().trim().max(5000).nullable().optional(),
  oralHistory: z.string().trim().max(10000).nullable().optional(),
  oralHistoryProvenance: z.string().trim().max(2000).nullable().optional(),
  /** Required when setting/changing UNRWA number (D8 card copy). */
  unrwaEvidenceAttachmentId: z.string().uuid().nullable().optional(),
});

const orNull = (v: string | null | undefined): string | null => {
  const trimmed = (v ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Save R13 displacement fields. RPC also upserts person_identifiers for
 * UNRWA / family_card_1948 when those values are set. UNRWA requires an
 * uploaded card (evidence_attachment_id) for perfect-match eligibility.
 */
export async function savePersonDisplacement(
  input: z.input<typeof SaveSchema>,
): Promise<PersonDisplacement> {
  const parsed = SaveSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');

  const unrwa = orNull(parsed.unrwaRegistrationNumber);
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase.rpc('upsert_person_displacement', {
    p_person_id: parsed.personId,
    p_unrwa_registration_number: unrwa,
    p_family_card_1948_number: orNull(parsed.familyCard1948Number),
    p_host_country_first: orNull(parsed.hostCountryFirst),
    p_host_country_current: orNull(parsed.hostCountryCurrent),
    p_refugee_status: orNull(parsed.refugeeStatus),
    p_camp_name: orNull(parsed.campName),
    p_displacement_year: parsed.displacementYear ?? null,
    p_displacement_wave: orNull(parsed.displacementWave),
    p_land_property_notes: orNull(parsed.landPropertyNotes),
    p_oral_history: orNull(parsed.oralHistory),
    p_oral_history_provenance: orNull(parsed.oralHistoryProvenance),
    p_unrwa_evidence_attachment_id: parsed.unrwaEvidenceAttachmentId ?? null,
  });

  if (error) {
    if (/unrwa_evidence/i.test(error.message)) {
      throw new Error(
        'UNRWA registration number requires an uploaded card copy.',
      );
    }
    throw new Error(`Failed to save displacement: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as PersonDisplacement | null;
  if (!row) throw new Error('Displacement save returned no row');
  return row;
}

/** Load existing UNRWA evidence attachment id, if any. */
export async function loadUnrwaEvidenceAttachmentId(
  personId: string,
): Promise<string | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data } = await supabase
    .from('person_identifiers')
    .select('evidence_attachment_id')
    .eq('person_id', personId)
    .eq('id_type', 'unrwa_registration')
    .maybeSingle();
  return (data as { evidence_attachment_id: string | null } | null)
    ?.evidence_attachment_id ?? null;
}
