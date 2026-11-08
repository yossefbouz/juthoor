/**
 * Zod schemas shared between server actions and client forms.
 *
 * Rules enforced here (Step 3 Tree Builder):
 *   - Gender UI limited to 'M' | 'F' (decision 2026-04-17).
 *   - Death year cannot precede birth year.
 *   - Birth year bounded to [1000, currentYear] — guards typos.
 *   - Each child MUST have a motherId (FRS rule 11).
 *   - At least one given name (AR or EN) on every person.
 *
 * Keep schemas pure — no DB calls, no Effect, no React.
 */

import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Optional free-text field that ACCEPTS '' (the natural empty value of a
 * controlled input) and treats it as "not provided". Earlier `.min(1)`
 * versions rejected the react-hook-form '' defaults, which silently
 * blocked every Arabic-only person submission. Blank-vs-present logic
 * lives in `hasText`; normalization to null happens at the DB boundary.
 * No transforms — keeps z.input === z.output so resolver + safe-action
 * type inference stay intact.
 */
function optionalTrimmedString(max: number) {
  return z.string().trim().max(max).optional();
}

/** True when an optional text field actually carries content. */
export function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim() !== '');
}

/** Gender limited to M/F in the UI; schema must also reject X/U. */
export const genderUIEnum = z.enum(['M', 'F']);

/** Pedigree values allowed on a child link. */
export const pedigreeEnum = z.enum(['birth', 'adopted', 'foster']);

const CURRENT_YEAR = new Date().getUTCFullYear();

const yearSchema = z
  .number()
  .int()
  .gte(1000, 'Year must be 1000 or later')
  .lte(CURRENT_YEAR, 'Year cannot be in the future');

// ============================================================================
// Person
// ============================================================================

export const personInputSchema = z
  .object({
    treeId: uuid,
    arGivenName: optionalTrimmedString(100),
    arSurname: optionalTrimmedString(100),
    enGivenName: optionalTrimmedString(100),
    enSurname: optionalTrimmedString(100),
    gender: genderUIEnum,
    birthYear: yearSchema.optional(),
    deathYear: yearSchema.optional(),
    placeOfOriginId: uuid.optional(),
    placeOfOriginName: optionalTrimmedString(200),
    notes: optionalTrimmedString(5000),
    // R10 mandatory parent names (Unknown default applied at create).
    fatherGivenAr: optionalTrimmedString(100),
    fatherSurnameAr: optionalTrimmedString(100),
    motherGivenAr: optionalTrimmedString(100),
    motherMaidenAr: optionalTrimmedString(100),
    fatherGivenEn: optionalTrimmedString(100),
    fatherSurnameEn: optionalTrimmedString(100),
    motherGivenEn: optionalTrimmedString(100),
    motherMaidenEn: optionalTrimmedString(100),
    // Optional D8 identifiers (saved after create).
    unrwaRegistrationNumber: optionalTrimmedString(120),
    familyCard1948Number: optionalTrimmedString(120),
  })
  .refine(
    (input) => hasText(input.arGivenName) || hasText(input.enGivenName),
    {
      message:
        'At least one given name is required (Arabic or English)',
      path: ['arGivenName'],
    }
  )
  .refine(
    (input) =>
      input.birthYear === undefined ||
      input.deathYear === undefined ||
      input.deathYear >= input.birthYear,
    {
      message: 'Death year cannot be before birth year',
      path: ['deathYear'],
    }
  );

export type PersonInput = z.infer<typeof personInputSchema>;

// ============================================================================
// Add Relative (person + relationship link in one action)
// ============================================================================

/** Relationship kinds that actually create a link (self/unrelated don't). */
export const relativeKindEnum = z.enum([
  'child',
  'parent',
  'spouse',
  'sibling',
]);

export type RelativeKind = z.infer<typeof relativeKindEnum>;

/**
 * Input for `addRelativeAction`: the new person's details plus how they
 * attach to the anchor. `motherId` / `newPlaceholderMother` only apply
 * when kind='child' and the anchor is the father (multi-spouse rule).
 */
export const addRelativeInputSchema = z.intersection(
  personInputSchema,
  z.object({
    anchorPersonId: uuid,
    kind: relativeKindEnum,
    motherId: uuid.optional(),
    newPlaceholderMother: z.boolean().optional(),
  })
);

export type AddRelativeInput = z.infer<typeof addRelativeInputSchema>;

// ============================================================================
// Child Link (enforces mother requirement)
// ============================================================================

export const childLinkSchema = z.object({
  childId: uuid,
  fatherId: uuid,
  motherId: uuid, // REQUIRED — FRS rule 11: every child must be linked to a mother.
  pedigree: pedigreeEnum.default('birth'),
  birthOrder: z.number().int().positive().optional(),
});

export type ChildLinkInput = z.infer<typeof childLinkSchema>;

/**
 * Multi-spouse mother validator (FRS rule: when a father has multiple
 * recorded partners, every child must be linked to one of THOSE
 * partners — not to an unrelated woman).
 *
 * Factory so we can feed it runtime data (father's known partner ids)
 * without polluting the base schema with DB concerns.
 *
 * Behaviour:
 *   - 0 known partners → any motherId is allowed (first child bootstraps the family).
 *   - 1+ known partners → motherId MUST be in the set.
 */
export function createChildLinkWithPartnersSchema(
  knownPartnerIds: readonly string[]
) {
  const partnerSet = new Set(knownPartnerIds);
  return childLinkSchema.refine(
    (input) => partnerSet.size === 0 || partnerSet.has(input.motherId),
    {
      message:
        "motherId must be one of the father's recorded partners (multi-spouse rule)",
      path: ['motherId'],
    }
  );
}

// ============================================================================
// Tree
// ============================================================================

export const treeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  isPublic: z.boolean().default(false),
});

export type TreeInput = z.infer<typeof treeInputSchema>;

// ============================================================================
// Family
// ============================================================================

export const familyInputSchema = z
  .object({
    treeId: uuid,
    partner1Id: uuid.optional(),
    partner2Id: uuid.optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (input) => input.partner1Id !== undefined || input.partner2Id !== undefined,
    { message: 'A family must have at least one partner set' }
  );

export type FamilyInput = z.infer<typeof familyInputSchema>;
