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
  /** '' clears; omit/undefined keeps (RPC NULL=keep). Form saves should send ''. */
  unrwaRegistrationNumber: z.string().max(120).nullable().optional(),
  familyCard1948Number: z.string().max(120).nullable().optional(),
  hostCountryFirst: z.string().max(120).nullable().optional(),
  hostCountryCurrent: z.string().max(120).nullable().optional(),
  refugeeStatus: z.string().max(120).nullable().optional(),
  campName: z.string().max(120).nullable().optional(),
  displacementYear: z.number().int().min(1900).max(2100).nullable().optional(),
  displacementWave: z.string().max(120).nullable().optional(),
  landPropertyNotes: z.string().max(5000).nullable().optional(),
  oralHistory: z.string().max(10000).nullable().optional(),
  oralHistoryProvenance: z.string().max(2000).nullable().optional(),
  /** Required when setting/changing UNRWA number to a non-empty value. */
  unrwaEvidenceAttachmentId: z.string().uuid().nullable().optional(),
});

/**
 * Pass-through for RPC text args.
 *  - undefined → omit from RPC args (keep existing)
 *  - null or '' → pass '' so RPC clears
 *  - otherwise trimmed string
 */
function rpcClearableText(
  v: string | null | undefined,
): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return '';
  return v.trim();
}

/**
 * Save R13 displacement fields. RPC also upserts person_identifiers for
 * UNRWA / family_card_1948. Convention: '' clears, null/omit keeps for
 * identifiers; form text fields pass '' to clear so COALESCE keep does not
 * block clears. UNRWA evidence is required only when setting a non-empty UNRWA.
 */
export async function savePersonDisplacement(
  input: z.input<typeof SaveSchema>,
): Promise<PersonDisplacement> {
  const parsed = SaveSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');

  const supabase = await createJuthoorSupabaseClient();

  const unrwaArg = rpcClearableText(parsed.unrwaRegistrationNumber);
  const settingUnrwa = unrwaArg !== undefined && unrwaArg.length > 0;

  const args: Record<string, unknown> = {
    p_person_id: parsed.personId,
  };
  if (unrwaArg !== undefined) args.p_unrwa_registration_number = unrwaArg;
  const cardArg = rpcClearableText(parsed.familyCard1948Number);
  if (cardArg !== undefined) args.p_family_card_1948_number = cardArg;

  const hostFirst = rpcClearableText(parsed.hostCountryFirst);
  if (hostFirst !== undefined) args.p_host_country_first = hostFirst;
  const hostCurrent = rpcClearableText(parsed.hostCountryCurrent);
  if (hostCurrent !== undefined) args.p_host_country_current = hostCurrent;
  const refugee = rpcClearableText(parsed.refugeeStatus);
  if (refugee !== undefined) args.p_refugee_status = refugee;
  const camp = rpcClearableText(parsed.campName);
  if (camp !== undefined) args.p_camp_name = camp;
  if (parsed.displacementYear !== undefined) {
    args.p_displacement_year = parsed.displacementYear;
  }
  const wave = rpcClearableText(parsed.displacementWave);
  if (wave !== undefined) args.p_displacement_wave = wave;
  const land = rpcClearableText(parsed.landPropertyNotes);
  if (land !== undefined) args.p_land_property_notes = land;
  const oral = rpcClearableText(parsed.oralHistory);
  if (oral !== undefined) args.p_oral_history = oral;
  const oralProv = rpcClearableText(parsed.oralHistoryProvenance);
  if (oralProv !== undefined) args.p_oral_history_provenance = oralProv;

  // Evidence only when setting a non-empty UNRWA. Omit on clear/keep so RPC
  // does not demand a card when only camp/oral history changed.
  if (settingUnrwa) {
    args.p_unrwa_evidence_attachment_id =
      parsed.unrwaEvidenceAttachmentId ?? null;
  }

  const { data, error } = await supabase.rpc(
    'upsert_person_displacement',
    args as never,
  );

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
