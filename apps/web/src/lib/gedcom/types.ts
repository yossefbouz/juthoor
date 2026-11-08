/**
 * GEDCOM intermediate representation.
 *
 * After we parse a .ged file we normalise it into this flat snapshot
 * shape. Import then upserts these arrays into Supabase; export reads
 * from Supabase and reconstructs this same shape before serialisation.
 *
 * This decoupling is what lets us write a deterministic round-trip
 * unit test: `parse(serialize(snapshot)) ≈ snapshot`.
 *
 * Every id below is a GEDCOM xref (e.g. `@I1@`, `@F1@`) — NOT a
 * Supabase uuid. The import pipeline maps xrefs to uuids when
 * persisting, and the export pipeline re-uses `gedcom_xref` columns
 * to preserve the originals.
 */

import type {
  EventType,
  GenderType,
  NameType,
  PedigreeType,
} from '@/types/database';

export interface GedcomPerson {
  readonly xref: string;
  readonly gender: GenderType;
  readonly names: readonly GedcomName[];
  readonly events: readonly GedcomEvent[];
  readonly notes?: string;
  /**
   * IFT Admin full export only (`maskLivingPeople: false`).
   * Emitted as GEDCOM `1 REFN <type>:<value>` (e.g. family_card_1948:…).
   */
  readonly refns?: readonly { readonly type: string; readonly value: string }[];
  /**
   * Extra NOTE lines (identifiers as `NOTE UNRWA:…`, origin as `NOTE ORIGIN:…`).
   * Appended after `notes` when serializing.
   */
  readonly extraNotes?: readonly string[];
}

export interface GedcomName {
  readonly nameType: NameType;
  readonly given?: string;
  readonly surname?: string;
  /** Full GEDCOM NAME line, e.g. "Ahmad /Bouz/" — preserved for round-trip. */
  readonly raw?: string;
  readonly lang?: 'ar' | 'en';
}

export interface GedcomFamily {
  readonly xref: string;
  /** Husband xref if present. */
  readonly husbandXref?: string;
  /** Wife xref if present. */
  readonly wifeXref?: string;
  readonly children: readonly GedcomChildLink[];
  readonly events: readonly GedcomEvent[];
}

export interface GedcomChildLink {
  readonly childXref: string;
  readonly pedigree: PedigreeType;
}

export interface GedcomEvent {
  readonly eventType: EventType;
  /** Raw GEDCOM DATE string, e.g. "12 MAY 1920". */
  readonly dateRaw?: string;
  readonly year?: number;
  /** Raw PLAC text — matched to `places` later via placeMatching.ts. */
  readonly place?: string;
}

export interface GedcomSnapshot {
  readonly persons: readonly GedcomPerson[];
  readonly families: readonly GedcomFamily[];
  /** Header metadata — we keep the SOUR line so exports acknowledge origin. */
  readonly header: {
    readonly source?: string;
    readonly submitter?: string;
    readonly charset?: string;
  };
}
