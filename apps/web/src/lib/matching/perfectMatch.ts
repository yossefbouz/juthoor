/**
 * D8: perfect-match eligibility. UNRWA short-circuits require card evidence
 * (meta.identifier_evidence) before auto-link / perfect-match treatment.
 */
export function isPerfectMatchEligible(breakdown: unknown): boolean {
  if (!breakdown || typeof breakdown !== 'object') return false;
  const meta = (breakdown as { meta?: Record<string, unknown> }).meta;
  if (!meta || meta.perfect_match !== true) return false;
  if (meta.identifier_match === 'unrwa_registration') {
    return meta.identifier_evidence === true;
  }
  return true;
}
