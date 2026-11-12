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
 * Export emits GEDCOM 7.0. Import accepts both 5.5.1 and 7.0.
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

/** Known custom IDNO TYPE values (AIO2 Table 29). */
export type GedcomIdnoType =
  | 'UNRWA'
  | 'HOSTCARD1948'
  | 'PAID'
  | 'PAPASSPORT'
  | 'ILID'
  | string;

/** Custom EVEN TYPE values declared in HEAD.SCHMA. */
export type GedcomEvenType = 'DISPLACEMENT' | 'CAMPREGN' | string;

export interface GedcomIdno {
  readonly type: GedcomIdnoType;
  readonly value: string;
  /** Optional NOTE under IDNO (e.g. restricted visibility for ILID). */
  readonly note?: string;
}

export interface GedcomPerson {
  readonly xref: string;
  readonly gender: GenderType;
  readonly names: readonly GedcomName[];
  readonly events: readonly GedcomEvent[];
  readonly notes?: string;
  /**
   * GEDCOM 7 identifiers: `1 IDNO <value>` + `2 TYPE <type>`.
   * Mapped from `person_identifiers` on IFT Admin full export.
   */
  readonly idnos?: readonly GedcomIdno[];
  /**
   * Legacy 5.5.1-style identifiers (`1 REFN type:value`), retained on
   * import so older files still round-trip into `idnos`/`refns`.
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
  /** Arabic-script form (`2 TRAN` under NAME). */
  readonly tran?: string;
  /** Phonetic / English romanization (`2 ROMN` under NAME). */
  readonly romn?: string;
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
  /**
   * GEDCOM TYPE substructure (stored in `events.description`).
   * Used for `1 EVEN` / `2 TYPE DISPLACEMENT|CAMPREGN`.
   */
  readonly typeDetail?: string;
  /** Raw GEDCOM DATE string, e.g. "12 MAY 1920". */
  readonly dateRaw?: string;
  readonly year?: number;
  /** Raw PLAC text — matched to `places` later via placeMatching.ts. */
  readonly place?: string;
  /** Optional NOTE under the event. */
  readonly note?: string;
}

export interface GedcomSnapshot {
  readonly persons: readonly GedcomPerson[];
  readonly families: readonly GedcomFamily[];
  /** Header metadata — we keep the SOUR line so exports acknowledge origin. */
  readonly header: {
    readonly source?: string;
    readonly submitter?: string;
    readonly charset?: string;
    /** GEDC VERS from HEAD (e.g. "5.5.1" or "7.0"). */
    readonly version?: string;
    /** Extension tags declared under HEAD.SCHMA (optional on import). */
    readonly schemaTags?: readonly string[];
  };
}
