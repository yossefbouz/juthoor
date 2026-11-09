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

/** Contact ciphertext cols are not granted on SELECT; use get_person_contact. */
const PROFILE_COLS =
  'person_id, achievements_ar, achievements_en, contribution_ar, contribution_en, contact_consent, contribution_consent, current_country, current_city, preferred_contact_method';

type PersonContactRpcRow = {
  contact_email?: string | null;
  contact_phone?: string | null;
  current_country?: string | null;
  current_city?: string | null;
  current_address?: string | null;
  preferred_contact_method?: string | null;
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
  const [{ data, error }, { data: person }] = await Promise.all([
    supabase
      .from('person_profiles')
      .select(PROFILE_COLS)
      .eq('person_id', personId)
      .maybeSingle(),
    supabase
      .from('persons')
      .select('is_living')
      .eq('id', personId)
      .maybeSingle(),
  ]);
  if (error) return null; // table missing / not yet migrated — degrade silently
  if (!data) return null;
  const row = data as PersonProfile;
  const isLiving = Boolean((person as { is_living?: boolean } | null)?.is_living);
  const hideStory =
    isLiving && !Boolean(row.contribution_consent) && !mayManage;

  let contactEmail: string | null = null;
  let contactPhone: string | null = null;
  let currentAddress: string | null = null;
  let currentCountry = row.current_country ?? null;
  let currentCity = row.current_city ?? null;
  let preferredMethod = row.preferred_contact_method ?? null;
  if (mayManage) {
    const { data: contactRows } = await supabase.rpc('get_person_contact', {
      p_person_id: personId,
    });
    const first = (Array.isArray(contactRows) ? contactRows[0] : contactRows) as
      | PersonContactRpcRow
      | null;
    contactEmail = first?.contact_email ?? null;
    contactPhone = first?.contact_phone ?? null;
    currentAddress = first?.current_address ?? null;
    currentCountry = first?.current_country ?? currentCountry;
    currentCity = first?.current_city ?? currentCity;
    preferredMethod = first?.preferred_contact_method ?? preferredMethod;
  }

  return {
    person_id: row.person_id,
    achievements_ar: hideStory ? null : (row.achievements_ar ?? null),
    achievements_en: hideStory ? null : (row.achievements_en ?? null),
    contribution_ar: hideStory ? null : (row.contribution_ar ?? null),
    contribution_en: hideStory ? null : (row.contribution_en ?? null),
    contact_consent: Boolean(row.contact_consent),
    contact_email: contactEmail,
    contact_phone: contactPhone,
    current_country: currentCountry,
    current_city: currentCity,
    current_address: currentAddress,
    preferred_contact_method: preferredMethod,
    contribution_consent: Boolean(row.contribution_consent),
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
          ? { contact_email: orNull(parsed.contactEmail) }
          : {}),
        ...(parsed.contactPhone !== undefined
          ? { contact_phone: orNull(parsed.contactPhone) }
          : {}),
        ...(parsed.currentCountry !== undefined
          ? { current_country: orNull(parsed.currentCountry) }
          : {}),
        ...(parsed.currentCity !== undefined
          ? { current_city: orNull(parsed.currentCity) }
          : {}),
        ...(parsed.currentAddress !== undefined
          ? { current_address: orNull(parsed.currentAddress) }
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
  const row = data as PersonProfile;
  const { data: contactRows } = await supabase.rpc('get_person_contact', {
    p_person_id: parsed.personId,
  });
  const first = (Array.isArray(contactRows) ? contactRows[0] : contactRows) as
    | PersonContactRpcRow
    | null;
  return {
    ...row,
    contact_email: first?.contact_email ?? null,
    contact_phone: first?.contact_phone ?? null,
    current_country: first?.current_country ?? row.current_country ?? null,
    current_city: first?.current_city ?? row.current_city ?? null,
    current_address: first?.current_address ?? null,
    preferred_contact_method:
      first?.preferred_contact_method ?? row.preferred_contact_method ?? null,
    contact_consent: Boolean(row.contact_consent),
    contribution_consent: Boolean(row.contribution_consent),
  };
}
