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
  unrwa_field_of_operations: string | null;
  unrwa_registration_date: number | null;
  unrwa_registration_status: string | null;
  unrwa_services_area: string | null;
  host_travel_document_number: string | null;
  host_id_residency_number: string | null;
  pa_id_number: string | null;
  palestinian_passport_number: string | null;
  israeli_id_number: string | null;
  other_identity_document: string | null;
  land_record_reference: string | null;
  land_registry: string | null;
  property_location: string | null;
  ownership_nature: string | null;
};

const DISPLACEMENT_COLS =
  'person_id, unrwa_registration_number, family_card_1948_number, host_country_first, host_country_current, refugee_status, camp_name, displacement_year, displacement_wave, land_property_notes, oral_history, oral_history_provenance, unrwa_field_of_operations, unrwa_registration_date, unrwa_registration_status, unrwa_services_area, host_travel_document_number, host_id_residency_number, pa_id_number, palestinian_passport_number, israeli_id_number, other_identity_document, land_record_reference, land_registry, property_location, ownership_nature';

const UNRWA_FIELDS = [
  'jordan',
  'lebanon',
  'syria',
  'west_bank',
  'gaza',
] as const;

const UNRWA_STATUSES = ['active', 'inactive', 'descendant'] as const;

const LAND_REGISTRIES = [
  'ottoman_tapu',
  'british_mandate',
  'israeli',
  'pa',
  'other',
] as const;

const OWNERSHIP_NATURES = ['owner', 'co_owner', 'heir', 'tenant'] as const;

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
    unrwa_field_of_operations: row?.unrwa_field_of_operations ?? null,
    unrwa_registration_date: row?.unrwa_registration_date ?? null,
    unrwa_registration_status: row?.unrwa_registration_status ?? null,
    unrwa_services_area: row?.unrwa_services_area ?? null,
    host_travel_document_number: row?.host_travel_document_number ?? null,
    host_id_residency_number: row?.host_id_residency_number ?? null,
    pa_id_number: row?.pa_id_number ?? null,
    palestinian_passport_number: row?.palestinian_passport_number ?? null,
    israeli_id_number: row?.israeli_id_number ?? null,
    other_identity_document: row?.other_identity_document ?? null,
    land_record_reference: row?.land_record_reference ?? null,
    land_registry: row?.land_registry ?? null,
    property_location: row?.property_location ?? null,
    ownership_nature: row?.ownership_nature ?? null,
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
  unrwaFieldOfOperations: z
    .union([z.enum(UNRWA_FIELDS), z.literal(''), z.null()])
    .optional(),
  unrwaRegistrationDate: z
    .number()
    .int()
    .min(1948)
    .max(2100)
    .nullable()
    .optional(),
  unrwaRegistrationStatus: z
    .union([z.enum(UNRWA_STATUSES), z.literal(''), z.null()])
    .optional(),
  unrwaServicesArea: z.string().max(200).nullable().optional(),
  hostTravelDocumentNumber: z.string().max(120).nullable().optional(),
  hostIdResidencyNumber: z.string().max(120).nullable().optional(),
  paIdNumber: z.string().max(120).nullable().optional(),
  palestinianPassportNumber: z.string().max(120).nullable().optional(),
  israeliIdNumber: z.string().max(120).nullable().optional(),
  otherIdentityDocument: z.string().max(500).nullable().optional(),
  landRecordReference: z.string().max(500).nullable().optional(),
  landRegistry: z
    .union([z.enum(LAND_REGISTRIES), z.literal(''), z.null()])
    .optional(),
  propertyLocation: z.string().max(500).nullable().optional(),
  ownershipNature: z
    .union([z.enum(OWNERSHIP_NATURES), z.literal(''), z.null()])
    .optional(),
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

  const fieldOps = rpcClearableText(parsed.unrwaFieldOfOperations);
  if (fieldOps !== undefined) args.p_unrwa_field_of_operations = fieldOps;
  if (parsed.unrwaRegistrationDate !== undefined) {
    // NULL = clear (sentinel year-date; trigger/RPC maps 0001-01-01 → NULL).
    // Non-null year becomes Jan 1 of that year for the date column.
    args.p_unrwa_registration_date =
      parsed.unrwaRegistrationDate == null
        ? '0001-01-01'
        : `${parsed.unrwaRegistrationDate}-01-01`;
  }
  const regStatus = rpcClearableText(parsed.unrwaRegistrationStatus);
  if (regStatus !== undefined) args.p_unrwa_registration_status = regStatus;
  const services = rpcClearableText(parsed.unrwaServicesArea);
  if (services !== undefined) args.p_unrwa_services_area = services;
  const travel = rpcClearableText(parsed.hostTravelDocumentNumber);
  if (travel !== undefined) args.p_host_travel_document_number = travel;
  const hostId = rpcClearableText(parsed.hostIdResidencyNumber);
  if (hostId !== undefined) args.p_host_id_residency_number = hostId;
  const paId = rpcClearableText(parsed.paIdNumber);
  if (paId !== undefined) args.p_pa_id_number = paId;
  const passport = rpcClearableText(parsed.palestinianPassportNumber);
  if (passport !== undefined) args.p_palestinian_passport_number = passport;
  const israeliId = rpcClearableText(parsed.israeliIdNumber);
  if (israeliId !== undefined) args.p_israeli_id_number = israeliId;
  const otherId = rpcClearableText(parsed.otherIdentityDocument);
  if (otherId !== undefined) args.p_other_identity_document = otherId;
  const landRef = rpcClearableText(parsed.landRecordReference);
  if (landRef !== undefined) args.p_land_record_reference = landRef;
  const landReg = rpcClearableText(parsed.landRegistry);
  if (landReg !== undefined) args.p_land_registry = landReg;
  const propLoc = rpcClearableText(parsed.propertyLocation);
  if (propLoc !== undefined) args.p_property_location = propLoc;
  const ownNat = rpcClearableText(parsed.ownershipNature);
  if (ownNat !== undefined) args.p_ownership_nature = ownNat;

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
