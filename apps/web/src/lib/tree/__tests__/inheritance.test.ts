import { describe, expect, it } from 'vitest';

import {
  applyFatherInheritance,
  deriveDisplayName,
  inheritSurname,
  inheritVillage,
  nextPlaceholderNumber,
} from '../inheritance';

describe('inheritSurname', () => {
  it("returns the father's Arabic surname when the child's is blank", () => {
    const result = inheritSurname({
      childArSurname: '',
      childEnSurname: '',
      fatherArSurname: 'البوز',
      fatherEnSurname: 'Bouz',
    });
    expect(result.arSurname).toBe('البوز');
    expect(result.enSurname).toBe('Bouz');
  });

  it('prefers an explicit child surname over the father inheritance', () => {
    const result = inheritSurname({
      childArSurname: 'الحنبلي',
      childEnSurname: 'Hanbali',
      fatherArSurname: 'البوز',
      fatherEnSurname: 'Bouz',
    });
    expect(result.arSurname).toBe('الحنبلي');
    expect(result.enSurname).toBe('Hanbali');
  });

  it('returns undefined when both child and father have no surname', () => {
    const result = inheritSurname({
      childArSurname: '',
      childEnSurname: '',
      fatherArSurname: undefined,
      fatherEnSurname: undefined,
    });
    expect(result.arSurname).toBeUndefined();
    expect(result.enSurname).toBeUndefined();
  });
});

describe('inheritVillage', () => {
  it("inherits the father's place of origin when none is set on the child", () => {
    expect(
      inheritVillage({
        childPlaceId: null,
        fatherPlaceId: 'place-jerusalem',
      })
    ).toBe('place-jerusalem');
  });

  it("keeps the child's explicit place when set", () => {
    expect(
      inheritVillage({
        childPlaceId: 'place-haifa',
        fatherPlaceId: 'place-jerusalem',
      })
    ).toBe('place-haifa');
  });

  it('returns null when neither is set', () => {
    expect(
      inheritVillage({
        childPlaceId: null,
        fatherPlaceId: null,
      })
    ).toBeNull();
  });
});

describe('deriveDisplayName (FRS: women use maiden name)', () => {
  it('for male: joins given + surname', () => {
    expect(
      deriveDisplayName({
        gender: 'M',
        given: 'أحمد',
        maidenSurname: undefined,
        birthSurname: 'البوز',
      })
    ).toBe('أحمد البوز');
  });

  it('for female: uses MAIDEN surname when available, NOT married', () => {
    expect(
      deriveDisplayName({
        gender: 'F',
        given: 'فاطمة',
        maidenSurname: 'القاسم',
        birthSurname: 'البوز', // would be married-name; must be ignored
      })
    ).toBe('فاطمة القاسم');
  });

  it('for female: falls back to birth/given when no maiden is known', () => {
    expect(
      deriveDisplayName({
        gender: 'F',
        given: 'فاطمة',
        maidenSurname: undefined,
        birthSurname: 'البوز',
      })
    ).toBe('فاطمة البوز');
  });

  it('returns null when nothing is provided', () => {
    expect(
      deriveDisplayName({
        gender: 'M',
        given: undefined,
        maidenSurname: undefined,
        birthSurname: undefined,
      })
    ).toBeNull();
  });
});

describe('nextPlaceholderNumber (per-father scope)', () => {
  it('returns 1 when the father has no placeholder spouses', () => {
    expect(nextPlaceholderNumber(0)).toBe(1);
  });

  it('returns N+1 for N existing placeholder spouses', () => {
    expect(nextPlaceholderNumber(1)).toBe(2);
    expect(nextPlaceholderNumber(3)).toBe(4);
  });
});

describe('applyFatherInheritance', () => {
  it('fills blank surname and origin from the father', () => {
    const result = applyFatherInheritance(
      {
        arSurname: '',
        enSurname: undefined,
        placeOfOriginId: undefined,
        fatherGivenAr: undefined,
        fatherSurnameAr: undefined,
        fatherGivenEn: undefined,
        fatherSurnameEn: undefined,
      },
      {
        arSurname: 'البوز',
        enSurname: 'Bouz',
        arGivenName: 'يوسف',
        enGivenName: 'Yousef',
        placeOfOriginId: 'place-1',
      }
    );
    expect(result.arSurname).toBe('البوز');
    expect(result.enSurname).toBe('Bouz');
    expect(result.placeOfOriginId).toBe('place-1');
    expect(result.fatherGivenAr).toBe('يوسف');
    expect(result.fatherSurnameAr).toBe('البوز');
  });

  it('keeps explicit child values', () => {
    const result = applyFatherInheritance(
      {
        arSurname: 'الحنبلي',
        enSurname: 'Hanbali',
        placeOfOriginId: 'place-child',
        fatherGivenAr: 'محمود',
      },
      {
        arSurname: 'البوز',
        enSurname: 'Bouz',
        arGivenName: 'يوسف',
        enGivenName: 'Yousef',
        placeOfOriginId: 'place-1',
      }
    );
    expect(result.arSurname).toBe('الحنبلي');
    expect(result.enSurname).toBe('Hanbali');
    expect(result.placeOfOriginId).toBe('place-child');
    expect(result.fatherGivenAr).toBe('محمود');
  });

  it('is a no-op when father defaults are null', () => {
    const input = { arSurname: '', placeOfOriginId: undefined };
    expect(applyFatherInheritance(input, null)).toEqual(input);
  });
});
