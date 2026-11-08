import { describe, expect, it } from 'vitest';

import { isPerfectMatchEligible } from '../perfectMatch';

describe('isPerfectMatchEligible', () => {
  it('returns false when not a perfect match', () => {
    expect(isPerfectMatchEligible({ meta: { decision: 'review' } })).toBe(false);
  });

  it('allows family_card perfect matches without separate evidence', () => {
    expect(
      isPerfectMatchEligible({
        meta: {
          perfect_match: true,
          identifier_match: 'family_card_1948',
        },
      }),
    ).toBe(true);
  });

  it('blocks UNRWA perfect matches without evidence', () => {
    expect(
      isPerfectMatchEligible({
        meta: {
          perfect_match: true,
          identifier_match: 'unrwa_registration',
          identifier_evidence: false,
        },
      }),
    ).toBe(false);
  });

  it('allows UNRWA perfect matches with evidence', () => {
    expect(
      isPerfectMatchEligible({
        meta: {
          perfect_match: true,
          identifier_match: 'unrwa_registration',
          identifier_evidence: true,
        },
      }),
    ).toBe(true);
  });
});
