'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authActionClient } from '@/lib/safe-action';
import {
  FEMALE_MAIDEN_SURNAME_MESSAGE,
  genderUIEnum,
  nameTypeEnum,
  personInputSchema,
} from '@/lib/tree/zodSchemas';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

import {
  createPersonWithPrimaryName,
  englishDisplayFromParts,
  joinDisplay,
  loadFatherInheritanceDefaults,
  resolvePrimaryNameType,
  toUserFacingDbError,
  type SupabaseServerClient,
} from './personCreate';

/**
 * Insert a person atomically (person + primary person_names + optional
 * BIRT/DEAT events) via the `create_person_with_primary_name` RPC.
 * The RPC is SECURITY INVOKER — RLS enforces write-access to the tree.
 *
 * Display-name policy (FRS): for women we store the maiden form as
 * the displayed name. Married-name rows (`name_type='married'`) may be
 * added later via a separate mutation so they stay searchable but are
 * never picked as display.
 */

/**
 * R4 defaults for the add-person UI: surname + origin from a known father.
 * Used to pre-fill the form; the server re-applies the same rules on save.
 */
export const getInheritanceDefaultsAction = authActionClient
  .schema(z.object({ fatherId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    return loadFatherInheritanceDefaults(supabase, parsedInput.fatherId);
  });

/** Primary given/surname for prefilling R10 parent-name fields. */
export const getPersonPrimaryNamesAction = authActionClient
  .schema(z.object({ personId: z.string().uuid() }))
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { data, error } = await supabase
      .from('person_names')
      .select('lang, given_name, surname, is_primary')
      .eq('person_id', parsedInput.personId)
      .order('is_primary', { ascending: false });
    if (error) throw new Error(error.message);
    let arGiven: string | undefined;
    let arSurname: string | undefined;
    let enGiven: string | undefined;
    let enSurname: string | undefined;
    for (const row of data ?? []) {
      const given = row.given_name?.trim();
      const surname = row.surname?.trim();
      if (row.lang === 'ar') {
        if (given && !arGiven) arGiven = given;
        if (surname && !arSurname) arSurname = surname;
      } else if (row.lang === 'en') {
        if (given && !enGiven) enGiven = given;
        if (surname && !enSurname) enSurname = surname;
      }
    }
    return { arGiven, arSurname, enGiven, enSurname };
  });

export const insertPersonAction = authActionClient
  .schema(
    personInputSchema.extend({
      /** When true (add-self), set profiles.linked_person_id to the new person. */
      linkAsSelf: z.boolean().optional(),
    })
  )
  .action(async ({ parsedInput, ctx: { userId } }) => {
    const { linkAsSelf, ...personInput } = parsedInput;
    const supabase = await createJuthoorSupabaseClient();
    const personId = await createPersonWithPrimaryName(supabase, personInput);

    if (linkAsSelf) {
      const { error: linkErr } = await supabase.rpc('claim_linked_person', {
        p_person_id: personId,
      });
      if (linkErr) {
        // Do not leave an unlinked orphan on someone else's / failed claim path.
        await supabase.from('persons').delete().eq('id', personId);
        throw new Error(linkErr.message);
      }
    }

    revalidatePath('/tree');
    revalidatePath(`/tree/${parsedInput.treeId}`);
    revalidatePath('/dashboard');
    return { personId };
  });

/**
 * Insert a placeholder "Female N" mother linked to a specific father.
 * Per the 2026-04-17 decision, N is scoped per-father (so each father
 * has his own Female 1, 2, ...). Numbering is derived from how many
 * placeholder spouses the father already has.
 */
const insertPlaceholderMotherSchema = z.object({
  treeId: z.string().uuid(),
  fatherId: z.string().uuid(),
});

export const insertPlaceholderMotherAction = authActionClient
  .schema(insertPlaceholderMotherSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();

    // Count existing placeholder spouses of this father.
    const { data: existingFamilies, error: famErr } = await supabase
      .from('families')
      .select('partner1_id, partner2_id')
      .eq('tree_id', parsedInput.treeId)
      .or(
        `partner1_id.eq.${parsedInput.fatherId},partner2_id.eq.${parsedInput.fatherId}`
      );

    if (famErr) throw new Error(famErr.message);

    const partnerIds = (existingFamilies ?? [])
      .map((f) =>
        f.partner1_id === parsedInput.fatherId ? f.partner2_id : f.partner1_id
      )
      .filter((id): id is string => Boolean(id));

    let placeholderCount = 0;
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from('persons')
        .select('id, notes')
        .in('id', partnerIds);
      placeholderCount = (partners ?? []).filter(
        (p) => p.notes === 'placeholder'
      ).length;
    }

    const n = placeholderCount + 1;

    // Create the placeholder person (Female gender, name "Female N").
    const placeholderId = await createPersonWithPrimaryName(
      supabase,
      {
        treeId: parsedInput.treeId,
        gender: 'F',
        arGivenName: `أنثى ${n}`,
        enGivenName: `Female ${n}`,
      },
      { isPlaceholder: true }
    );

    // Link placeholder as partner of the father in a new family.
    const { data: famRow, error: createFamErr } = await supabase
      .from('families')
      .insert({
        tree_id: parsedInput.treeId,
        partner1_id: parsedInput.fatherId,
        partner2_id: placeholderId,
      })
      .select('id')
      .single();

    if (createFamErr) throw new Error(createFamErr.message);

    revalidatePath('/tree');
    return { placeholderId, familyId: famRow.id };
  });

/**
 * Upgrade a placeholder person (e.g. "Female 1") into a real one.
 *
 * FRS flow: when the mother's real details become known, the user
 * edits the placeholder in-place so existing family_children links
 * (and thus the children already attached to her) are preserved —
 * no re-parenting needed at the DB level. The caller then surfaces
 * the affected children in a confirmation dialog so the user can
 * review (and unlink any that shouldn't actually belong to her).
 */
const CURRENT_YEAR = new Date().getUTCFullYear();
const yearSchema = z
  .number()
  .int()
  .gte(1000)
  .lte(CURRENT_YEAR);

const upgradePlaceholderPersonSchema = z
  .object({
    placeholderId: z.string().uuid(),
    treeId: z.string().uuid(),
    arGivenName: z.string().trim().min(1).max(100).optional(),
    arSurname: z.string().trim().max(100).optional(),
    enGivenName: z.string().trim().min(1).max(100).optional(),
    enSurname: z.string().trim().max(100).optional(),
    gender: genderUIEnum,
    nameType: nameTypeEnum.optional(),
    birthYear: yearSchema.optional(),
    deathYear: yearSchema.optional(),
    placeOfOriginId: z.string().uuid().optional(),
    notes: z.string().max(5000).optional(),
  })
  .refine(
    (input) => Boolean(input.arGivenName) || Boolean(input.enGivenName),
    { message: 'At least one given name is required', path: ['arGivenName'] }
  )
  .refine(
    (input) =>
      input.birthYear === undefined ||
      input.deathYear === undefined ||
      input.deathYear >= input.birthYear,
    { message: 'Death year cannot be before birth year', path: ['deathYear'] }
  )
  .refine(
    (input) => !(input.gender === 'F' && input.nameType === 'married'),
    {
      message: FEMALE_MAIDEN_SURNAME_MESSAGE,
      path: ['nameType'],
    }
  );

export const upgradePlaceholderPersonAction = authActionClient
  .schema(upgradePlaceholderPersonSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();

    // Sanity: the row must actually be a placeholder before we upgrade.
    const { data: current, error: loadErr } = await supabase
      .from('persons')
      .select('id, notes, tree_id')
      .eq('id', parsedInput.placeholderId)
      .maybeSingle();

    if (loadErr) throw new Error(loadErr.message);
    if (!current) throw new Error('Placeholder person not found');
    if (current.notes !== 'placeholder') {
      throw new Error('Only placeholder persons can be upgraded');
    }
    if (current.tree_id !== parsedInput.treeId) {
      throw new Error('Tree mismatch');
    }

    if (parsedInput.gender === 'F' && parsedInput.nameType === 'married') {
      throw new Error(FEMALE_MAIDEN_SURNAME_MESSAGE);
    }

    const arDisplay =
      joinDisplay(parsedInput.arGivenName, parsedInput.arSurname) ?? null;
    const enDisplay = englishDisplayFromParts(
      parsedInput.enGivenName,
      parsedInput.enSurname,
      parsedInput.arGivenName,
      parsedInput.arSurname
    );

    // Years and place live on `events` (GEDCOM BIRT/DEAT), NOT on the
    // persons row — the persons table has no birth_year/death_year/
    // place_of_origin_id columns.
    const { error: updateErr } = await supabase
      .from('persons')
      .update({
        gender: parsedInput.gender,
        display_name_ar: arDisplay,
        display_name_en: enDisplay,
        notes: null, // clears the 'placeholder' tag
      })
      .eq('id', parsedInput.placeholderId);

    if (updateErr) throw new Error(toUserFacingDbError(updateErr.message));

    if (parsedInput.notes && parsedInput.notes.trim() !== '') {
      const { error: noteErr } = await supabase.rpc('upsert_person_note', {
        p_person_id: parsedInput.placeholderId,
        p_body: parsedInput.notes,
      });
      if (noteErr) throw new Error(toUserFacingDbError(noteErr.message));
    }

    if (parsedInput.birthYear !== undefined) {
      await upsertPersonYearEvent(supabase, {
        personId: parsedInput.placeholderId,
        eventType: 'BIRT',
        year: parsedInput.birthYear,
        placeId: parsedInput.placeOfOriginId ?? null,
      });
    }
    if (parsedInput.deathYear !== undefined) {
      await upsertPersonYearEvent(supabase, {
        personId: parsedInput.placeholderId,
        eventType: 'DEAT',
        year: parsedInput.deathYear,
        placeId: null,
      });
    }

    // Replace the primary person_names row with the real name.
    // Women always maiden; coerce married → maiden if it slipped through.
    const nameType = resolvePrimaryNameType(
      parsedInput.gender,
      parsedInput.nameType
    );
    const { error: nameErr } = await supabase
      .from('person_names')
      .update({
        given_name: parsedInput.arGivenName ?? parsedInput.enGivenName ?? null,
        surname: parsedInput.arSurname ?? parsedInput.enSurname ?? null,
        lang: parsedInput.arGivenName ? 'ar' : 'en',
        name_type: nameType,
      })
      .eq('person_id', parsedInput.placeholderId)
      .eq('is_primary', true);

    if (nameErr) throw new Error(nameErr.message);

    // Find children currently linked to this (now-upgraded) person so
    // the UI can offer a confirmation/unlink step.
    const { data: fams, error: famsErr } = await supabase
      .from('families')
      .select('id')
      .eq('tree_id', parsedInput.treeId)
      .or(
        `partner1_id.eq.${parsedInput.placeholderId},partner2_id.eq.${parsedInput.placeholderId}`
      );

    if (famsErr) throw new Error(famsErr.message);
    const familyIds = (fams ?? []).map((f) => f.id);

    const affectedChildren: { id: string; familyId: string }[] = [];
    if (familyIds.length > 0) {
      const { data: links, error: linksErr } = await supabase
        .from('family_children')
        .select('child_id, family_id')
        .in('family_id', familyIds);

      if (linksErr) throw new Error(linksErr.message);
      for (const l of links ?? []) {
        affectedChildren.push({ id: l.child_id, familyId: l.family_id });
      }
    }

    revalidatePath('/tree');
    return {
      personId: parsedInput.placeholderId,
      affectedChildren,
    };
  });

const deletePersonSchema = z.object({ id: z.string().uuid() });

export const deletePersonAction = authActionClient
  .schema(deletePersonSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const { error } = await supabase
      .from('persons')
      .delete()
      .eq('id', parsedInput.id);

    if (error) throw new Error(error.message);
    revalidatePath('/tree');
    return { success: true };
  });

/**
 * Insert-or-update the single BIRT/DEAT year event for a person. The
 * tree builder edits years as plain numbers; richer GEDCOM date strings
 * (date_value) are preserved when already present from an import.
 */
async function upsertPersonYearEvent(
  supabase: SupabaseServerClient,
  args: {
    readonly personId: string;
    readonly eventType: 'BIRT' | 'DEAT';
    readonly year: number;
    readonly placeId: string | null;
  }
): Promise<void> {
  const { data: existing, error: findErr } = await supabase
    .from('events')
    .select('id')
    .eq('person_id', args.personId)
    .eq('event_type', args.eventType)
    .limit(1);
  if (findErr) throw new Error(toUserFacingDbError(findErr.message));

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('events')
      .update({
        date_year: args.year,
        ...(args.placeId ? { place_id: args.placeId } : {}),
      })
      .eq('id', existing[0].id);
    if (error) throw new Error(toUserFacingDbError(error.message));
    return;
  }

  const { error } = await supabase.from('events').insert({
    person_id: args.personId,
    event_type: args.eventType,
    date_year: args.year,
    place_id: args.placeId,
  });
  if (error) throw new Error(toUserFacingDbError(error.message));
}
