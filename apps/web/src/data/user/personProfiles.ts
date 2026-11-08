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
  contribution_consent: boolean;
};

const PROFILE_COLS =
  'person_id, achievements_ar, achievements_en, contribution_ar, contribution_en, contact_consent, contact_email, contact_phone, contribution_consent';

/** Narrative enrichment (achievements, contribution) for a person.
 *  Degrades gracefully to null if the row is absent OR the `person_profiles`
 *  table has not been migrated yet — so the person page is unchanged until then. */
export async function loadPersonProfile(
  personId: string,
): Promise<PersonProfile | null> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_profiles')
    .select(PROFILE_COLS)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) return null; // table missing / not yet migrated — degrade silently
  if (!data) return null;
  const row = data as Partial<PersonProfile> & { person_id: string };
  return {
    person_id: row.person_id,
    achievements_ar: row.achievements_ar ?? null,
    achievements_en: row.achievements_en ?? null,
    contribution_ar: row.contribution_ar ?? null,
    contribution_en: row.contribution_en ?? null,
    contact_consent: Boolean(row.contact_consent),
    contact_email: row.contact_email ?? null,
    contact_phone: row.contact_phone ?? null,
    contribution_consent: Boolean(row.contribution_consent),
  };
}

const SaveSchema = z.object({
  personId: z.string().uuid(),
  achievementsAr: z.string().trim().max(2000).nullable().optional(),
  achievementsEn: z.string().trim().max(2000).nullable().optional(),
  contributionAr: z.string().trim().max(2000).nullable().optional(),
  contributionEn: z.string().trim().max(2000).nullable().optional(),
  contactConsent: z.boolean().optional(),
  contactEmail: z.union([z.string().trim().email().max(200), z.literal(''), z.null()]).optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
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
  return {
    ...row,
    contact_consent: Boolean(row.contact_consent),
    contribution_consent: Boolean(row.contribution_consent),
  };
}
