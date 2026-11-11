'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PersonProfile = {
  person_id: string;
  achievements_ar: string | null;
  achievements_en: string | null;
  contribution_ar: string | null;
  contribution_en: string | null;
  contact_consent: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  current_country: string | null;
  current_city: string | null;
  current_address: string | null;
  preferred_contact_method: string | null;
  contribution_consent: boolean;
};

/** Story/location cols are not granted on SELECT; use get_person_story / get_person_contact. */
const PROFILE_COLS = 'person_id, contact_consent, contribution_consent';

type PersonContactRpcRow = {
  contact_email?: string | null;
  contact_phone?: string | null;
  current_country?: string | null;
  current_city?: string | null;
  current_address?: string | null;
  preferred_contact_method?: string | null;
};

type PersonStoryRpcRow = {
  achievements_ar?: string | null;
  achievements_en?: string | null;
  contribution_ar?: string | null;
  contribution_en?: string | null;
  contribution_consent?: boolean | null;
};

async function viewerMayManageOptional(personId: string): Promise<boolean> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return false;
  const supabase = await createJuthoorSupabaseClient();
  const [{ data: canEdit }, { data: isOwner }, { data: profile }] = await Promise.all([
    supabase.rpc('can_edit_optional_person_fields', { p_person_id: personId }),
    supabase.rpc('is_record_owner', { p_person_id: personId }),
    supabase.from('profiles').select('is_admin').eq('id', uid).maybeSingle(),
  ]);
  return Boolean(canEdit || isOwner || (profile as { is_admin?: boolean } | null)?.is_admin);
}

/** Narrative enrichment (achievements, contribution) for a person.
 *  Living people without contribution_consent: strip achievements/contribution
 *  unless the viewer manages the record. Contact email/phone only for managers. */
export async function loadPersonProfile(
  personId: string,
): Promise<PersonProfile | null> {
  const supabase = await createJuthoorSupabaseClient();
  const mayManage = await viewerMayManageOptional(personId);
  const [{ data, error }, { data: storyRows }, { data: contactRows }] =
    await Promise.all([
      supabase
        .from('person_profiles')
        .select(PROFILE_COLS)
        .eq('person_id', personId)
        .maybeSingle(),
      supabase.rpc('get_person_story', { p_person_id: personId }),
      mayManage
        ? supabase.rpc('get_person_contact', { p_person_id: personId })
        : Promise.resolve({ data: null }),
    ]);
  if (error) return null; // table missing / not yet migrated — degrade silently
  if (!data) return null;
  const row = data as Pick<
    PersonProfile,
    'person_id' | 'contact_consent' | 'contribution_consent'
  >;
  const story = (
    Array.isArray(storyRows) ? storyRows[0] : storyRows
  ) as PersonStoryRpcRow | null;
  const contact = (
    Array.isArray(contactRows) ? contactRows[0] : contactRows
  ) as PersonContactRpcRow | null;

  return {
    person_id: row.person_id,
    achievements_ar: story?.achievements_ar ?? null,
    achievements_en: story?.achievements_en ?? null,
    contribution_ar: story?.contribution_ar ?? null,
    contribution_en: story?.contribution_en ?? null,
    contact_consent: Boolean(row.contact_consent),
    contact_email: contact?.contact_email ?? null,
    contact_phone: contact?.contact_phone ?? null,
    // Location only from consent-gated RPC (never REST fallback).
    current_country: contact?.current_country ?? null,
    current_city: contact?.current_city ?? null,
    current_address: contact?.current_address ?? null,
    preferred_contact_method: contact?.preferred_contact_method ?? null,
    contribution_consent: Boolean(
      story?.contribution_consent ?? row.contribution_consent,
    ),
  };
}

const PREFERRED_CONTACT_METHODS = [
  'email',
  'mobile',
  'messaging',
  'do_not_contact',
] as const;

const SaveSchema = z.object({
  personId: z.string().uuid(),
  achievementsAr: z.string().trim().max(2000).nullable().optional(),
  achievementsEn: z.string().trim().max(2000).nullable().optional(),
  contributionAr: z.string().trim().max(2000).nullable().optional(),
  contributionEn: z.string().trim().max(2000).nullable().optional(),
  contactConsent: z.boolean().optional(),
  contactEmail: z.union([z.string().trim().email().max(200), z.literal(''), z.null()]).optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  currentCountry: z.string().trim().max(120).nullable().optional(),
  currentCity: z.string().trim().max(120).nullable().optional(),
  currentAddress: z.string().trim().max(500).nullable().optional(),
  preferredContactMethod: z
    .union([z.enum(PREFERRED_CONTACT_METHODS), z.literal(''), z.null()])
    .optional(),
  contributionConsent: z.boolean().optional(),
});

const orNull = (v: string | null | undefined): string | null => {
  const trimmed = (v ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** Cleared contact fields must be '' so the encrypt trigger nulls *_enc (NULL means keep). */
const clearableContact = (v: string | null | undefined): string => {
  const trimmed = (v ?? '').trim();
  return trimmed.length > 0 ? trimmed : '';
};

/** Upsert a person's narrative. Authorization is enforced by RLS via
 *  can_edit_optional_person_fields (D1: living owner/grant/admin; deceased writers). */
export async function savePersonProfile(
  input: z.input<typeof SaveSchema>,
): Promise<PersonProfile> {
  const parsed = SaveSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase
    .from('person_profiles')
    .upsert(
      {
        person_id: parsed.personId,
        achievements_ar: orNull(parsed.achievementsAr),
        achievements_en: orNull(parsed.achievementsEn),
        contribution_ar: orNull(parsed.contributionAr),
        contribution_en: orNull(parsed.contributionEn),
        ...(parsed.contactConsent !== undefined
          ? { contact_consent: parsed.contactConsent }
          : {}),
        ...(parsed.contactEmail !== undefined
          ? { contact_email: clearableContact(parsed.contactEmail) }
          : {}),
        ...(parsed.contactPhone !== undefined
          ? { contact_phone: clearableContact(parsed.contactPhone) }
          : {}),
        ...(parsed.currentCountry !== undefined
          ? { current_country: orNull(parsed.currentCountry) }
          : {}),
        ...(parsed.currentCity !== undefined
          ? { current_city: orNull(parsed.currentCity) }
          : {}),
        ...(parsed.currentAddress !== undefined
          ? { current_address: clearableContact(parsed.currentAddress) }
          : {}),
        ...(parsed.preferredContactMethod !== undefined
          ? { preferred_contact_method: orNull(parsed.preferredContactMethod) }
          : {}),
        ...(parsed.contributionConsent !== undefined
          ? { contribution_consent: parsed.contributionConsent }
          : {}),
        updated_by: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id' },
    )
    .select(PROFILE_COLS)
    .single();
  if (error) throw new Error(`Failed to save profile: ${error.message}`);
  const reloaded = await loadPersonProfile(parsed.personId);
  if (!reloaded) throw new Error('Failed to reload profile after save');
  return reloaded;
}
