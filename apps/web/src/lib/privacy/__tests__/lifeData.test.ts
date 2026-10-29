import { describe, expect, it } from 'vitest';
import { isPresumedLiving, shouldHideLifeData } from '../lifeData';

describe('isPresumedLiving (decision D2)', () => {
  const year = 2026;

  it('treats a recorded death as deceased, whatever the birth year', () => {
    expect(isPresumedLiving({ hasDeath: true, birthYear: 2000 }, year)).toBe(false);
    expect(isPresumedLiving({ hasDeath: true, birthYear: null }, year)).toBe(false);
  });

  it('treats no death and a birth under 150 years ago as living', () => {
    expect(isPresumedLiving({ hasDeath: false, birthYear: 1990 }, year)).toBe(true);
    expect(isPresumedLiving({ hasDeath: false, birthYear: 1877 }, year)).toBe(true);
  });

  it('presumes deceased at 150 or more years since birth', () => {
    expect(isPresumedLiving({ hasDeath: false, birthYear: 1876 }, year)).toBe(false);
    expect(isPresumedLiving({ hasDeath: false, birthYear: 1800 }, year)).toBe(false);
  });

  it('fails toward living when the birth year is unknown', () => {
    expect(isPresumedLiving({ hasDeath: false, birthYear: null }, year)).toBe(true);
  });
});

describe('shouldHideLifeData', () => {
  it('hides a living person from a non-privileged (public) viewer', () => {
    expect(shouldHideLifeData(true, false)).toBe(true);
  });

  it('shows a living person to a privileged (owner/approved) viewer', () => {
    expect(shouldHideLifeData(true, true)).toBe(false);
  });

  it('never hides a deceased person', () => {
    expect(shouldHideLifeData(false, false)).toBe(false);
    expect(shouldHideLifeData(false, true)).toBe(false);
  });
});
