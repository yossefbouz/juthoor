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
 * Load contact fields from person_profiles (Wave 3 D3 columns).
 * Returns null when the row is missing or RLS denies read.
 */
export async function loadPersonContact(
  personId: string,
): Promise<PersonContact | null> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return null;
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_profiles')
    .select('person_id, contact_email, contact_phone, contact_consent')
    .eq('person_id', personId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as {
    person_id: string;
    contact_email: string | null;
    contact_phone: string | null;
    contact_consent: boolean;
  };

  let canManage = false;
  if (!row.contact_consent) {
    const { data: person } = await supabase
      .from('persons')
      .select('tree_id')
      .eq('id', personId)
      .maybeSingle();
    const treeId = (person as { tree_id: string } | null)?.tree_id;
    if (treeId) {
      const [{ data: write }, { data: profile }] = await Promise.all([
        supabase.rpc('can_write_tree', { p_tree_id: treeId }),
        supabase
          .from('profiles')
          .select('is_admin, is_moderator')
          .eq('id', uid)
          .maybeSingle(),
      ]);
      const staff = profile as { is_admin?: boolean; is_moderator?: boolean } | null;
      canManage = Boolean(write) || Boolean(staff?.is_admin) || Boolean(staff?.is_moderator);
    }
  }

  const allowed = row.contact_consent || canManage;
  return {
    person_id: row.person_id,
    email: allowed ? row.contact_email : null,
    phone: allowed ? row.contact_phone : null,
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
