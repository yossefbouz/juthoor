'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';
import { logAccessAction } from '@/data/user/accessLog';

export type PersonContact = {
  person_id: string;
  email: string | null;
  phone: string | null;
  preferred_method: string | null;
  consent_share: boolean;
};

/**
 * Load contact fields via get_person_contact (SECURITY DEFINER).
 * Contact email/phone are not granted on person_profiles SELECT.
 */
export async function loadPersonContact(
  personId: string,
): Promise<PersonContact | null> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return null;
  const supabase = await createJuthoorSupabaseClient();

  const { data, error } = await supabase.rpc('get_person_contact', {
    p_person_id: personId,
  });
  if (error) return null;

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    contact_email: string | null;
    contact_phone: string | null;
    contact_consent: boolean;
  }>;
  if (rows.length === 0) {
    // Still surface consent flag from non-contact columns when present.
    const { data: profile } = await supabase
      .from('person_profiles')
      .select('person_id, contact_consent')
      .eq('person_id', personId)
      .maybeSingle();
    if (!profile) return null;
    return {
      person_id: personId,
      email: null,
      phone: null,
      preferred_method: null,
      consent_share: Boolean(
        (profile as { contact_consent?: boolean }).contact_consent,
      ),
    };
  }

  const row = rows[0];
  return {
    person_id: personId,
    email: row.contact_email ?? null,
    phone: row.contact_phone ?? null,
    preferred_method: null,
    consent_share: Boolean(row.contact_consent),
  };
}

/**
 * Reveal contact fields to the caller and record an access_log view.
 */
export async function revealPersonContact(
  personId: string,
): Promise<PersonContact | null> {
  const contact = await loadPersonContact(personId);
  if (!contact) return null;
  const hasFields = Boolean(contact.email || contact.phone);
  if (hasFields) {
    await logAccessAction({
      resourceType: 'person_contact',
      resourceId: personId,
      action: 'view',
    });
  }
  return contact;
}
