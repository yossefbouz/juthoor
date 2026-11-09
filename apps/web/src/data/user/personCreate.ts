/**
 * Internal person-creation helpers shared by the person/relative server
 * actions. NOT a 'use server' module — these are plain functions that
 * receive an already-authenticated Supabase client from the caller.
 */

import { toEnglishPhonetic } from '@/lib/search/phonetic';
import type { FatherInheritanceDefaults } from '@/lib/tree/inheritance';
import type { PersonInput } from '@/lib/tree/zodSchemas';
import type { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

export type SupabaseServerClient = Awaited<
  ReturnType<typeof createJuthoorSupabaseClient>
>;

/**
 * Load the father's primary surnames (AR/EN) and BIRT place for R4
 * inheritance. Returns null when the person has nothing usable.
 */
export async function loadFatherInheritanceDefaults(
  supabase: SupabaseServerClient,
  fatherId: string
): Promise<FatherInheritanceDefaults | null> {
  const [{ data: names, error: namesErr }, { data: birt, error: birtErr }] =
    await Promise.all([
      supabase
        .from('person_names')
        .select('lang, given_name, surname, is_primary')
        .eq('person_id', fatherId)
        .order('is_primary', { ascending: false }),
      supabase
        .from('events')
        .select('place_id')
        .eq('person_id', fatherId)
        .eq('event_type', 'BIRT')
        .not('place_id', 'is', null)
        .limit(1)
        .maybeSingle(),
    ]);

  if (namesErr) throw new Error(toUserFacingDbError(namesErr.message));
  if (birtErr) throw new Error(toUserFacingDbError(birtErr.message));

  let arSurname: string | undefined;
  let enSurname: string | undefined;
  let arGivenName: string | undefined;
  let enGivenName: string | undefined;
  for (const row of names ?? []) {
    const surname = row.surname?.trim();
    const given = row.given_name?.trim();
    if (row.lang === 'ar') {
      if (surname && !arSurname) arSurname = surname;
      if (given && !arGivenName) arGivenName = given;
    } else if (row.lang === 'en') {
      if (surname && !enSurname) enSurname = surname;
      if (given && !enGivenName) enGivenName = given;
    } else {
      if (surname && !arSurname && !enSurname) {
        arSurname = surname;
        enSurname = surname;
      }
      if (given && !arGivenName && !enGivenName) {
        arGivenName = given;
        enGivenName = given;
      }
    }
  }

  const placeOfOriginId = birt?.place_id ?? null;
  if (!arSurname && !enSurname && !arGivenName && !enGivenName && !placeOfOriginId) {
    return null;
  }
  return { arSurname, enSurname, arGivenName, enGivenName, placeOfOriginId };
}

export function blankToUndefined(
  value: string | undefined
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function joinDisplay(
  given: string | undefined,
  surname: string | undefined
): string | null {
  const g = given?.trim();
  const s = surname?.trim();
  if (g && s) return `${g} ${s}`;
  if (g) return g;
  if (s) return s;
  return null;
}

/**
 * Map raw Postgres/RLS error text to a message the (Arabic-first) UI can
 * show as-is. Falls back to the original message so real diagnostics are
 * never swallowed.
 */
export function toUserFacingDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('permission')) {
    return 'ليست لديك صلاحية التعديل على هذه الشجرة.';
  }
  if (lower.includes('not authenticated') || lower.includes('jwt')) {
    return 'انتهت الجلسة — يرجى تسجيل الدخول من جديد.';
  }
  if (lower.includes('duplicate key')) {
    return 'هذا الرابط مسجّل بالفعل.';
  }
  return message;
}

/**
 * Create a person atomically (person + primary name + optional BIRT/DEAT
 * events) via the `create_person_with_primary_name` RPC and return the
 * new person id. SECURITY INVOKER — RLS enforces tree write access.
 *
 * Display-name policy (FRS): women are stored under a maiden name row so
 * married names never become the displayed name.
 */
const UNKNOWN_AR = 'غير معروف';
const UNKNOWN_EN = 'Unknown';

/**
 * R10: apply Unknown defaults for empty given/surname on non-placeholders.
 * The RPC also applies these; we do it here so display names stay consistent
 * before the round-trip and so TypeScript callers see the same policy.
 */
export function applyUnknownNameDefaults(
  input: PersonInput,
  isPlaceholder: boolean
): {
  arGiven: string | undefined;
  arSurname: string | undefined;
  enGiven: string | undefined;
  enSurname: string | undefined;
} {
  let arGiven = blankToUndefined(input.arGivenName);
  let arSurname = blankToUndefined(input.arSurname);
  let enGiven = blankToUndefined(input.enGivenName);
  let enSurname = blankToUndefined(input.enSurname);

  if (isPlaceholder) {
    return { arGiven, arSurname, enGiven, enSurname };
  }

  const preferAr = Boolean(arGiven || arSurname || (!enGiven && !enSurname));
  if (!arGiven && !enGiven) {
    if (preferAr) arGiven = UNKNOWN_AR;
    else enGiven = UNKNOWN_EN;
  }
  if (!arSurname && !enSurname) {
    if (preferAr || arGiven) arSurname = UNKNOWN_AR;
    else enSurname = UNKNOWN_EN;
  } else {
    // Spec minimum: empty surname → Unknown even when the other language has one.
    if (arGiven && !arSurname) arSurname = UNKNOWN_AR;
    if (enGiven && !enSurname) enSurname = UNKNOWN_EN;
    if (!arSurname && !enSurname) {
      arSurname = preferAr ? UNKNOWN_AR : UNKNOWN_EN;
    }
  }

  return { arGiven, arSurname, enGiven, enSurname };
}

/**
 * Resolve primary name_type. Women always use maiden; a married type
 * passed for gender F is coerced (FRS hard rule).
 */
export function resolvePrimaryNameType(
  gender: PersonInput['gender'],
  requested?: PersonInput['nameType']
): NonNullable<PersonInput['nameType']> {
  if (gender === 'F') return 'maiden';
  if (!requested || requested === 'maiden' || requested === 'married') {
    return 'birth';
  }
  return requested;
}

/** Prefer explicit EN; otherwise romanize AR for display_name_en. */
export function englishDisplayFromParts(
  enGiven: string | undefined,
  enSurname: string | undefined,
  arGiven: string | undefined,
  arSurname: string | undefined
): string | null {
  const explicit = joinDisplay(enGiven, enSurname);
  if (explicit) return explicit;

  const romGiven =
    arGiven && arGiven !== UNKNOWN_AR ? toEnglishPhonetic(arGiven) : undefined;
  const romSurname =
    arSurname && arSurname !== UNKNOWN_AR
      ? toEnglishPhonetic(arSurname)
      : undefined;
  return joinDisplay(romGiven || undefined, romSurname || undefined);
}

export async function createPersonWithPrimaryName(
  supabase: SupabaseServerClient,
  input: PersonInput,
  opts: { readonly isPlaceholder?: boolean } = {}
): Promise<string> {
  const isPlaceholder = opts.isPlaceholder ?? false;
  const { arGiven, arSurname, enGiven, enSurname } = applyUnknownNameDefaults(
    input,
    isPlaceholder
  );

  const arDisplay = joinDisplay(arGiven, arSurname);
  const enDisplay = englishDisplayFromParts(enGiven, enSurname, arGiven, arSurname);
  const nameType = resolvePrimaryNameType(input.gender, input.nameType);

  const fatherGivenAr = blankToUndefined(input.fatherGivenAr);
  const fatherSurnameAr = blankToUndefined(input.fatherSurnameAr);
  const motherGivenAr = blankToUndefined(input.motherGivenAr);
  const motherMaidenAr = blankToUndefined(input.motherMaidenAr);
  const fatherGivenEn = blankToUndefined(input.fatherGivenEn);
  const fatherSurnameEn = blankToUndefined(input.fatherSurnameEn);
  const motherGivenEn = blankToUndefined(input.motherGivenEn);
  const motherMaidenEn = blankToUndefined(input.motherMaidenEn);

  const { data, error } = await supabase.rpc(
    'create_person_with_primary_name',
    {
      p_tree_id: input.treeId,
      p_gender: input.gender,
      p_name_type: nameType,
      p_lang: arGiven ? 'ar' : 'en',
      p_given_name: arGiven ?? enGiven ?? null,
      p_surname: arSurname ?? enSurname ?? null,
      p_display_name_ar: arDisplay,
      p_display_name_en: enDisplay,
      p_birth_year: input.birthYear ?? null,
      p_death_year: input.deathYear ?? null,
      p_place_of_origin_id: input.placeOfOriginId ?? null,
      p_is_placeholder: isPlaceholder,
      p_father_given_ar: fatherGivenAr ?? null,
      p_father_surname_ar: fatherSurnameAr ?? null,
      p_mother_given_ar: motherGivenAr ?? null,
      p_mother_maiden_ar: motherMaidenAr ?? null,
      p_father_given_en: fatherGivenEn ?? null,
      p_father_surname_en: fatherSurnameEn ?? null,
      p_mother_given_en: motherGivenEn ?? null,
      p_mother_maiden_en: motherMaidenEn ?? null,
    }
  );

  if (error) throw new Error(toUserFacingDbError(error.message));
  const row = Array.isArray(data) ? data[0] : data;
  const personId = row?.person_id as string | undefined;
  if (!personId) {
    throw new Error('لم يتم إنشاء الشخص — لم يُرجِع الخادم معرّفًا.');
  }
  return personId;
}
