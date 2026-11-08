'use server';

import { z } from 'zod';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PersonIdentifierType = 'unrwa_registration' | 'family_card_1948';

export type PersonIdentifier = {
  id: string;
  person_id: string;
  id_type: PersonIdentifierType;
  id_value: string;
  evidence_attachment_id: string | null;
};

const UpsertSchema = z.object({
  personId: z.string().uuid(),
  idType: z.enum(['unrwa_registration', 'family_card_1948']),
  idValue: z.string().trim().min(1).max(120),
  evidenceAttachmentId: z.string().uuid().nullable().optional(),
});

/**
 * Upsert a D8 identifier. UNRWA rows require evidenceAttachmentId (card copy).
 * Uses the PostgREST table directly (RLS: can_write_tree).
 */
export async function upsertPersonIdentifier(
  input: z.input<typeof UpsertSchema>,
): Promise<PersonIdentifier> {
  const parsed = UpsertSchema.parse(input);
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) throw new Error('Not authenticated');

  if (
    parsed.idType === 'unrwa_registration' &&
    !parsed.evidenceAttachmentId
  ) {
    throw new Error(
      'UNRWA registration number requires an uploaded card copy.',
    );
  }

  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_identifiers')
    .upsert(
      {
        person_id: parsed.personId,
        id_type: parsed.idType,
        id_value: parsed.idValue,
        evidence_attachment_id: parsed.evidenceAttachmentId ?? null,
      },
      { onConflict: 'person_id,id_type' },
    )
    .select('id, person_id, id_type, id_value, evidence_attachment_id')
    .single();

  if (error) throw new Error(error.message);
  return data as PersonIdentifier;
}
