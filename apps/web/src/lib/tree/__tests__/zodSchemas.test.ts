import { describe, expect, it } from 'vitest';

import {
  FEMALE_MAIDEN_SURNAME_MESSAGE,
  childLinkSchema,
  createChildLinkWithPartnersSchema,
  personInputSchema,
  treeInputSchema,
} from '../zodSchemas';

const CURRENT_YEAR = new Date().getUTCFullYear();

describe('personInputSchema', () => {
  it('accepts a minimal valid payload (AR given name + gender)', () => {
    const parsed = personInputSchema.parse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'أحمد',
      gender: 'M',
    });
    expect(parsed.arGivenName).toBe('أحمد');
    expect(parsed.gender).toBe('M');
  });

  it('rejects a payload with no Arabic given name and no English given name', () => {
    const result = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      gender: 'F',
    });
    expect(result.success).toBe(false);
  });

  it('accepts either AR or EN given name when the other is missing', () => {
    const arOnly = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'فاطمة',
      gender: 'F',
    });
    const enOnly = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      enGivenName: 'Fatima',
      gender: 'F',
    });
    expect(arOnly.success).toBe(true);
    expect(enOnly.success).toBe(true);
  });

  it('rejects death year before birth year', () => {
    const result = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'خالد',
      gender: 'M',
      birthYear: 1950,
      deathYear: 1940,
    });
    expect(result.success).toBe(false);
  });

  it('rejects gender X and U (UI enforces M/F only per Step 3 decision)', () => {
    const x = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'س',
      gender: 'X',
    });
    const u = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'س',
      gender: 'U',
    });
    expect(x.success).toBe(false);
    expect(u.success).toBe(false);
  });

  it('rejects birth years in the future and absurdly early', () => {
    const future = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'أ',
      gender: 'M',
      birthYear: CURRENT_YEAR + 5,
    });
    const tooEarly = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'أ',
      gender: 'M',
      birthYear: 999,
    });
    expect(future.success).toBe(false);
    expect(tooEarly.success).toBe(false);
  });

  it('rejects an invalid treeId (must be UUID)', () => {
    const result = personInputSchema.safeParse({
      treeId: 'not-a-uuid',
      arGivenName: 'أ',
      gender: 'M',
    });
    expect(result.success).toBe(false);
  });

  it('rejects married nameType for female primary (maiden hard rule)', () => {
    const result = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'فاطمة',
      gender: 'F',
      nameType: 'married',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === FEMALE_MAIDEN_SURNAME_MESSAGE)).toBe(
        true,
      );
    }
  });

  it('allows maiden nameType for female and birth for male', () => {
    const female = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'فاطمة',
      gender: 'F',
      nameType: 'maiden',
    });
    const male = personInputSchema.safeParse({
      treeId: '11111111-1111-4111-8111-111111111111',
      arGivenName: 'أحمد',
      gender: 'M',
      nameType: 'birth',
    });
    expect(female.success).toBe(true);
    expect(male.success).toBe(true);
  });
});

describe('childLinkSchema', () => {
  it('requires motherId — child without a mother is rejected (FRS rule 11)', () => {
    const result = childLinkSchema.safeParse({
      childId: '11111111-1111-4111-8111-111111111111',
      fatherId: '22222222-2222-4222-8222-222222222222',
      // no motherId
      pedigree: 'birth',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a fully linked child with mother and father', () => {
    const result = childLinkSchema.safeParse({
      childId: '11111111-1111-4111-8111-111111111111',
      fatherId: '22222222-2222-4222-8222-222222222222',
      motherId: '33333333-3333-4333-8333-333333333333',
      pedigree: 'birth',
    });
    expect(result.success).toBe(true);
  });

  it('defaults pedigree to "birth" when omitted', () => {
    const result = childLinkSchema.parse({
      childId: '11111111-1111-4111-8111-111111111111',
      fatherId: '22222222-2222-4222-8222-222222222222',
      motherId: '33333333-3333-4333-8333-333333333333',
    });
    expect(result.pedigree).toBe('birth');
  });
});

describe('createChildLinkWithPartnersSchema (multi-spouse mother rule)', () => {
  const CHILD = '11111111-1111-4111-8111-111111111111';
  const FATHER = '22222222-2222-4222-8222-222222222222';
  const MOTHER_A = '33333333-3333-4333-8333-333333333333';
  const MOTHER_B = '44444444-4444-4444-8444-444444444444';
  const STRANGER = '55555555-5555-4555-8555-555555555555';

  it('accepts any motherId when father has no recorded partners yet (bootstrap)', () => {
    const schema = createChildLinkWithPartnersSchema([]);
    const result = schema.safeParse({
      childId: CHILD,
      fatherId: FATHER,
      motherId: STRANGER,
      pedigree: 'birth',
    });
    expect(result.success).toBe(true);
  });

  it('accepts motherId that matches one of the father\u2019s partners', () => {
    const schema = createChildLinkWithPartnersSchema([MOTHER_A, MOTHER_B]);
    const result = schema.safeParse({
      childId: CHILD,
      fatherId: FATHER,
      motherId: MOTHER_B,
      pedigree: 'birth',
    });
    expect(result.success).toBe(true);
  });

  it('rejects motherId that is not one of the father\u2019s partners', () => {
    const schema = createChildLinkWithPartnersSchema([MOTHER_A, MOTHER_B]);
    const result = schema.safeParse({
      childId: CHILD,
      fatherId: FATHER,
      motherId: STRANGER,
      pedigree: 'birth',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['motherId']);
    }
  });
});

describe('treeInputSchema', () => {
  it('requires a non-empty name', () => {
    const result = treeInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid tree', () => {
    const result = treeInputSchema.parse({ name: 'شجرة عائلة البوز' });
    expect(result.name).toBe('شجرة عائلة البوز');
    expect(result.isPublic).toBe(false);
  });
});
