/**
 * Juthoor Tree domain types.
 *
 * These are the shapes used by the client-side relationship solver
 * (`relationships.ts`), independent of the Supabase row shapes. This
 * isolation keeps the solver deterministic and testable: feed it a
 * `TreeSnapshot`, get back derived relationships.
 *
 * Naming convention: every id is a UUID string sourced from the DB,
 * except `placeholder-*` ids minted by the client when a parent is
 * unknown (e.g. "Female 1"). Placeholders are distinguished by
 * `person.isPlaceholder === true`.
 */

import type {
  GenderType,
  PedigreeType,
} from '@/types/database';

/** A single person in the solver view. Immutable by convention. */
export interface PersonView {
  readonly id: string;
  readonly gender: GenderType;
  readonly displayNameAr: string | null;
  readonly displayNameEn: string | null;
  readonly isPlaceholder: boolean;
  readonly birthYear: number | null;
  readonly deathYear: number | null;
  /**
   * True when a DEAT event exists even if date_year is null.
   * Used so undated deaths are not treated as living/concurrent spouses.
   */
  readonly hasDeath?: boolean;
  /** Explicit living flag when known (e.g. persons.is_living). */
  readonly isLiving?: boolean;
  /** Village id (FK to places) — optional. */
  readonly placeOfOriginId: string | null;
  /** Arabic name of the birth village/city — for chart card display. */
  readonly birthPlaceAr?: string | null;
}

/** A family unit connecting two partners. */
export interface FamilyView {
  readonly id: string;
  readonly partner1Id: string | null;
  readonly partner2Id: string | null;
  /**
   * True when a DIV event is recorded on this family, or when
   * `families.notes === 'dissolved'`. Dissolved unions do not count
   * toward concurrent-spouse limits.
   */
  readonly isDissolved: boolean;
}

/** A child-to-family link with pedigree (birth/adopted/foster). */
export interface FamilyChildLink {
  readonly familyId: string;
  readonly childId: string;
  readonly pedigree: PedigreeType;
  readonly birthOrder: number | null;
}

/** Everything the solver needs, flat. */
export interface TreeSnapshot {
  readonly persons: readonly PersonView[];
  readonly families: readonly FamilyView[];
  readonly familyChildren: readonly FamilyChildLink[];
}

/** Output of the solver: the five 360° slots around a focus person. */
export interface Neighbors {
  readonly focus: PersonView;
  /** `{father, mother}` — either or both may be null/placeholder. */
  readonly parents: {
    readonly father: PersonView | null;
    readonly mother: PersonView | null;
    /** The family-of-origin id, or null if unknown. */
    readonly familyId: string | null;
  };
  /** Full-siblings + half-siblings, sorted by birth order then id. */
  readonly siblings: readonly PersonView[];
  /** All known partners (current + former), most-recent heuristic first. */
  readonly spouses: readonly PersonView[];
  /**
   * Children grouped by the family they belong to — so multi-spouse
   * fathers have their kids grouped under each mother.
   */
  readonly childrenByFamily: readonly ChildGroup[];
}

/** One group of children that share a family (same other-parent). */
export interface ChildGroup {
  readonly familyId: string;
  readonly otherParentId: string | null;
  readonly children: readonly PersonView[];
}
