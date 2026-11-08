/**
 * Pure inheritance & display-name rules for the Tree Builder.
 *
 * Encodes two FRS rules:
 *   - Default surname = father's surname (auto-inherit on new children).
 *   - Default village = father's village.
 *   - Female display names use the MAIDEN surname, never the married.
 *
 * Keep this file free of I/O so inheritance is unit-testable in isolation.
 */

import type { GenderType } from '@/types/database';

export interface InheritSurnameInput {
  readonly childArSurname: string | undefined;
  readonly childEnSurname: string | undefined;
  readonly fatherArSurname: string | undefined;
  readonly fatherEnSurname: string | undefined;
}

export interface InheritSurnameResult {
  readonly arSurname: string | undefined;
  readonly enSurname: string | undefined;
}

export function inheritSurname(
  input: InheritSurnameInput
): InheritSurnameResult {
  return {
    arSurname:
      nonBlank(input.childArSurname) ?? nonBlank(input.fatherArSurname),
    enSurname:
      nonBlank(input.childEnSurname) ?? nonBlank(input.fatherEnSurname),
  };
}

export interface InheritVillageInput {
  readonly childPlaceId: string | null;
  readonly fatherPlaceId: string | null | undefined;
}

export function inheritVillage(input: InheritVillageInput): string | null {
  return input.childPlaceId ?? input.fatherPlaceId ?? null;
}

/** Father-side values used when applying R4 defaults to a new child. */
export interface FatherInheritanceDefaults {
  readonly arSurname: string | undefined;
  readonly enSurname: string | undefined;
  readonly arGivenName: string | undefined;
  readonly enGivenName: string | undefined;
  readonly placeOfOriginId: string | null;
}

/**
 * Apply R4 defaults to a new person's input. Explicit child values win;
 * blank surname / missing origin fall back to the father's.
 */
export function applyFatherInheritance<
  T extends {
    readonly arSurname?: string;
    readonly enSurname?: string;
    readonly placeOfOriginId?: string;
    readonly fatherGivenAr?: string;
    readonly fatherSurnameAr?: string;
    readonly fatherGivenEn?: string;
    readonly fatherSurnameEn?: string;
  },
>(person: T, father: FatherInheritanceDefaults | null): T {
  if (!father) return person;
  const surnames = inheritSurname({
    childArSurname: person.arSurname,
    childEnSurname: person.enSurname,
    fatherArSurname: father.arSurname,
    fatherEnSurname: father.enSurname,
  });
  const placeId = inheritVillage({
    childPlaceId: person.placeOfOriginId ?? null,
    fatherPlaceId: father.placeOfOriginId,
  });
  return {
    ...person,
    arSurname: surnames.arSurname,
    enSurname: surnames.enSurname,
    ...(placeId ? { placeOfOriginId: placeId } : {}),
    // Prefill R10 father-name fields when adding a child of a known father.
    fatherGivenAr: nonBlank(person.fatherGivenAr) ?? father.arGivenName,
    fatherSurnameAr: nonBlank(person.fatherSurnameAr) ?? father.arSurname,
    fatherGivenEn: nonBlank(person.fatherGivenEn) ?? father.enGivenName,
    fatherSurnameEn: nonBlank(person.fatherSurnameEn) ?? father.enSurname,
  };
}

export interface DeriveDisplayNameInput {
  readonly gender: GenderType;
  readonly given: string | undefined;
  /** The woman's maiden-family surname — the one we want to display. */
  readonly maidenSurname: string | undefined;
  /** For males: their birth/family surname. For females: the married name — never used for display. */
  readonly birthSurname: string | undefined;
}

export function deriveDisplayName(
  input: DeriveDisplayNameInput
): string | null {
  const given = nonBlank(input.given);
  const surname =
    input.gender === 'F'
      ? nonBlank(input.maidenSurname) ?? nonBlank(input.birthSurname)
      : nonBlank(input.birthSurname);

  if (given && surname) return `${given} ${surname}`;
  if (given) return given;
  if (surname) return surname;
  return null;
}

export function nextPlaceholderNumber(
  existingPlaceholderSpouseCount: number
): number {
  return existingPlaceholderSpouseCount + 1;
}

function nonBlank(s: string | null | undefined): string | undefined {
  if (s === null || s === undefined) return undefined;
  const trimmed = s.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
