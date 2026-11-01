/**
 * Years after birth beyond which a person with no recorded death is presumed
 * deceased (decision D2 of 24 October 2026).
 */
export const PRESUMED_DECEASED_AFTER_YEARS = 150;

/**
 * Decision D2: a person is living when no death is recorded, unless they were
 * born 150 or more years ago. A person with no birth year counts as living,
 * so the rule fails toward privacy. Same rule as `public.is_person_living`
 * with the D2 cut-off.
 */
export function isPresumedLiving(
  facts: { readonly hasDeath: boolean; readonly birthYear: number | null },
  currentYear: number = new Date().getFullYear()
): boolean {
  if (facts.hasDeath) return false;
  if (
    facts.birthYear !== null &&
    facts.birthYear <= currentYear - PRESUMED_DECEASED_AFTER_YEARS
  ) {
    return false;
  }
  return true;
}

/**
 * Whether to hide a living person's life data (birth year, birthplace) from a
 * viewer.
 *
 * Living people are masked from anyone WITHOUT privileged (owner /
 * approved-member) access to the tree — a public view must not broadcast a
 * living person's birth year + village of origin (plan §5.5). Deceased people
 * are never masked by this rule.
 */
export function shouldHideLifeData(
  isLiving: boolean,
  privileged: boolean
): boolean {
  return isLiving && !privileged;
}
