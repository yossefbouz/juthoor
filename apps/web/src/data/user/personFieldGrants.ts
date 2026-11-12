'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

export type PersonFieldGrantRow = {
  id: string;
  person_id: string;
  grantee_user_id: string;
  granted_by: string | null;
  scope: string;
  created_at: string;
  grantee_name?: string | null;
  grantee_email?: string | null;
};

export type GrantCandidate = {
  userId: string;
  displayName: string | null;
  email: string | null;
};

/** List active optional-field grants for a person (owner/admin/tree accessors via RLS). */
export async function listPersonFieldGrants(
  personId: string,
): Promise<PersonFieldGrantRow[]> {
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('person_field_grants')
    .select('id, person_id, grantee_user_id, granted_by, scope, created_at')
    .eq('person_id', personId)
    .eq('scope', 'optional_fields')
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  const rows = data as PersonFieldGrantRow[];
  const ids = Array.from(new Set(rows.map((r) => r.grantee_user_id)));
  if (ids.length === 0) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, display_name_ar')
    .in('id', ids);
  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      p.display_name_ar || p.display_name || null,
    ]),
  );
  return rows.map((r) => ({
    ...r,
    grantee_name: nameById.get(r.grantee_user_id) ?? null,
  }));
}

/**
 * Tree members who can receive an optional-fields grant (approved, not the
 * current user). Used by the grant panel picker.
 */
export async function listGrantCandidates(
  treeId: string,
): Promise<GrantCandidate[]> {
  const supabase = await createJuthoorSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const selfId = user?.id;

  const { data: members, error } = await supabase
    .from('tree_members')
    .select('user_id, role, status')
    .eq('tree_id', treeId)
    .eq('status', 'approved');
  if (error || !members) return [];

  const ids = Array.from(
    new Set(
      (members as Array<{ user_id: string }>)
        .map((m) => m.user_id)
        .filter((id) => Boolean(id) && id !== selfId),
    ),
  );
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, display_name_ar')
    .in('id', ids)
    .is('deleted_at', null);

  return (profiles ?? []).map((p) => ({
    userId: p.id,
    displayName: p.display_name_ar || p.display_name || null,
    email: null,
  }));
}

export const grantOptionalFieldsAction = authActionClient
  .schema(
    z.object({
      personId: z.string().uuid(),
      granteeUserId: z.string().uuid(),
      treeId: z.string().uuid().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx: { userId } }) => {
    if (parsedInput.granteeUserId === userId) {
      throw new Error('You already own this record');
    }
    const supabase = await createJuthoorSupabaseClient();
    // Upsert needs INSERT + UPDATE RLS. Migration adds person_field_grants UPDATE.
    const { data, error } = await supabase
      .from('person_field_grants')
      .upsert(
        {
          person_id: parsedInput.personId,
          grantee_user_id: parsedInput.granteeUserId,
          granted_by: userId,
          scope: 'optional_fields',
        },
        { onConflict: 'person_id,grantee_user_id,scope' },
      )
      .select('id, person_id, grantee_user_id, granted_by, scope, created_at')
      .single();
    if (error) throw new Error(error.message);

    if (parsedInput.treeId) {
      revalidatePath(`/tree/${parsedInput.treeId}/person/${parsedInput.personId}`);
    }
    return { ok: true as const, grant: data as PersonFieldGrantRow };
  });

export const revokeOptionalFieldsGrantAction = authActionClient
  .schema(
    z.object({
      grantId: z.string().uuid(),
      personId: z.string().uuid(),
      treeId: z.string().uuid().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { error } = await supabase
      .from('person_field_grants')
      .delete()
      .eq('id', parsedInput.grantId)
      .eq('person_id', parsedInput.personId);
    if (error) throw new Error(error.message);

    if (parsedInput.treeId) {
      revalidatePath(`/tree/${parsedInput.treeId}/person/${parsedInput.personId}`);
    }
    return { ok: true as const };
  });
