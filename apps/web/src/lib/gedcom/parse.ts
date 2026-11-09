/**
 * GEDCOM 5.5.1 / 7.0 → Juthoor snapshot parser.
 *
 * Wraps `parse-gedcom` (which returns a unist AST) and walks the tree
 * extracting INDI and FAM records into our flat `GedcomSnapshot`
 * shape. We deliberately do NOT use `compact()` from parse-gedcom
 * because it discards xref pointers we need for linking.
 *
 * Detects GEDC VERS from HEAD (defaults to 5.5.1 when absent). Export
 * always writes 7.0; import accepts both. GEDCOM 7 extras understood:
 *   - HEAD.SCHMA (optional)
 *   - INDI.IDNO + TYPE
 *   - NAME.TRAN / NAME.ROMN
 *   - EVEN.TYPE (DISPLACEMENT / CAMPREGN)
 *   - CONT continuation lines under NOTE / IDNO
 *
 * Why roll our own walker:
 *   - We must preserve the `@I1@`/`@F1@` xrefs (for gedcom_xref column).
 *   - Arabic names use `/Surname/` slashes the same as Latin — so the
 *     NAME field parser is universal.
 *   - We tolerate files that are missing HEAD or TRLR; both are common
 *     in the wild.
 */

import { parse as parseGedcomAst } from 'parse-gedcom';

import type {
  EventType,
  GenderType,
  NameType,
  PedigreeType,
} from '@/types/database';

import type {
  GedcomChildLink,
  GedcomEvent,
  GedcomFamily,
  GedcomIdno,
  GedcomName,
  GedcomPerson,
  GedcomSnapshot,
} from './types';

interface AstNode {
  readonly type?: string;
  readonly data?: Record<string, unknown>;
  readonly value?: unknown;
  readonly children?: readonly AstNode[];
}

const KNOWN_EVENT_TYPES = new Set<EventType>([
  'BIRT', 'DEAT', 'BURI', 'BAPM', 'CHR',
  'EMIG', 'IMMI', 'NATU', 'CENS', 'RESI', 'EVEN',
  'MARR', 'DIV', 'ANUL', 'ENGA', 'MARS', 'MARL',
  'MARB', 'MARC', 'DIVF', 'SEPA',
]);

export function parseGedcom(raw: string): GedcomSnapshot {
  if (!raw || raw.trim().length === 0) {
    throw new Error('GEDCOM input is empty');
  }

  const ast = parseGedcomAst(raw) as AstNode;
  const top: readonly AstNode[] = ast.children ?? [];

  const persons: GedcomPerson[] = [];
  const families: GedcomFamily[] = [];
  let header: GedcomSnapshot['header'] = {};

  for (const node of top) {
    const kind = tagOf(node);
    if (kind === 'HEAD') {
      header = parseHeader(node);
    } else if (kind === 'INDI') {
      const person = parseIndividual(node);
      if (person) persons.push(person);
    } else if (kind === 'FAM') {
      const family = parseFamily(node);
      if (family) families.push(family);
    }
  }

  return { persons, families, header };
}

// ============================================================================
// Header
// ============================================================================

function parseHeader(node: AstNode): GedcomSnapshot['header'] {
  const header: {
    source?: string;
    submitter?: string;
    charset?: string;
    version?: string;
    schemaTags?: string[];
  } = {};

  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const value = valueOf(child);
    if (tag === 'SOUR' && value) header.source = value;
    if (tag === 'SUBM' && value) header.submitter = value;
    if (tag === 'CHAR' && value) header.charset = value;
    if (tag === 'GEDC') {
      for (const g of child.children ?? []) {
        if (tagOf(g) === 'VERS') {
          const v = valueOf(g);
          if (v) header.version = v;
        }
      }
    }
    if (tag === 'SCHMA') {
      const tags: string[] = [];
      for (const s of child.children ?? []) {
        if (tagOf(s) === 'TAG') {
          const tv = valueOf(s);
          if (tv) tags.push(tv);
        }
      }
      if (tags.length > 0) header.schemaTags = tags;
    }
  }

  if (!header.version) header.version = '5.5.1';
  return header;
}

// ============================================================================
// Individual (INDI)
// ============================================================================

function parseIndividual(node: AstNode): GedcomPerson | null {
  const xref = xrefOf(node);
  if (!xref) return null;

  const names: GedcomName[] = [];
  const events: GedcomEvent[] = [];
  const idnos: GedcomIdno[] = [];
  const refns: { type: string; value: string }[] = [];
  let gender: GenderType = 'U';
  let notes: string | undefined;

  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const value = joinedValue(child);

    if (tag === 'NAME' && value) {
      names.push(parseName(child, value));
    } else if (tag === 'SEX') {
      gender = normaliseGender(value);
    } else if (tag === 'NOTE' && value) {
      notes = value;
    } else if (tag === 'IDNO' && value) {
      const idno = parseIdno(child, value);
      if (idno) idnos.push(idno);
    } else if (tag === 'REFN' && value) {
      // Legacy 5.5.1: `REFN type:value`
      const colon = value.indexOf(':');
      if (colon > 0) {
        refns.push({
          type: value.slice(0, colon).trim(),
          value: value.slice(colon + 1).trim(),
        });
      } else {
        refns.push({ type: 'REFN', value });
      }
    } else if (tag && KNOWN_EVENT_TYPES.has(tag as EventType)) {
      events.push(parseEvent(child, tag as EventType));
    }
  }

  return {
    xref,
    gender,
    names,
    events,
    notes,
    idnos: idnos.length > 0 ? idnos : undefined,
    refns: refns.length > 0 ? refns : undefined,
  };
}

function parseName(node: AstNode, raw: string): GedcomName {
  const base = parseNameLine(raw, nameTypeOf(node));
  let tran: string | undefined;
  let romn: string | undefined;
  let lang = base.lang;

  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const value = joinedValue(child);
    if (tag === 'TRAN' && value) {
      tran = value;
      for (const g of child.children ?? []) {
        if (tagOf(g) === 'LANG') {
          const lv = valueOf(g)?.toLowerCase();
          if (lv === 'ar' || lv === 'en') lang = lv;
        }
      }
      if (!lang) lang = detectLang(value);
    } else if (tag === 'ROMN' && value) {
      romn = value;
    }
  }

  return { ...base, lang, tran, romn };
}

function parseNameLine(raw: string, nameType: NameType): GedcomName {
  // Convention: GEDCOM names use /surname/ slashes around the surname:
  //   "Ahmad /Bouz/"  ->  given="Ahmad" surname="Bouz"
  const slashMatch = raw.match(/^(.*?)\s*\/(.*?)\/\s*(.*)$/);
  if (slashMatch) {
    const given = slashMatch[1].trim() || undefined;
    const surname = slashMatch[2].trim() || undefined;
    return { given, surname, nameType, raw, lang: detectLang(given ?? surname) };
  }
  // No slashes: treat the whole thing as given name.
  return { given: raw.trim() || undefined, nameType, raw, lang: detectLang(raw) };
}

function parseIdno(node: AstNode, value: string): GedcomIdno | null {
  let type = 'IDNO';
  let note: string | undefined;
  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const v = joinedValue(child);
    if (tag === 'TYPE' && v) type = v.trim().toUpperCase();
    if (tag === 'NOTE' && v) note = v;
  }
  if (!value.trim()) return null;
  return { type, value: value.trim(), note };
}

function nameTypeOf(node: AstNode): NameType {
  for (const child of node.children ?? []) {
    if (tagOf(child) === 'TYPE') {
      const v = valueOf(child)?.toLowerCase();
      if (v === 'birth' || v === 'married' || v === 'immigrant' ||
          v === 'aka' || v === 'professional' || v === 'maiden') {
        return v;
      }
    }
  }
  return 'birth';
}

function normaliseGender(value: string | undefined): GenderType {
  const v = value?.toUpperCase();
  if (v === 'M' || v === 'F' || v === 'X' || v === 'U') return v;
  return 'U';
}

// ============================================================================
// Family (FAM)
// ============================================================================

function parseFamily(node: AstNode): GedcomFamily | null {
  const xref = xrefOf(node);
  if (!xref) return null;

  let husbandXref: string | undefined;
  let wifeXref: string | undefined;
  const children: GedcomChildLink[] = [];
  const events: GedcomEvent[] = [];

  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const value = valueOf(child);

    if (tag === 'HUSB' && value) {
      husbandXref = value;
    } else if (tag === 'WIFE' && value) {
      wifeXref = value;
    } else if (tag === 'CHIL' && value) {
      children.push({
        childXref: value,
        pedigree: pedigreeOf(child),
      });
    } else if (tag && KNOWN_EVENT_TYPES.has(tag as EventType)) {
      events.push(parseEvent(child, tag as EventType));
    }
  }

  return { xref, husbandXref, wifeXref, children, events };
}

function pedigreeOf(node: AstNode): PedigreeType {
  for (const child of node.children ?? []) {
    if (tagOf(child) === 'PEDI') {
      const v = valueOf(child)?.toLowerCase();
      if (v === 'birth' || v === 'adopted' || v === 'foster' ||
          v === 'sealing' || v === 'other') {
        return v;
      }
    }
  }
  return 'birth';
}

// ============================================================================
// Events
// ============================================================================

function parseEvent(node: AstNode, eventType: EventType): GedcomEvent {
  let dateRaw: string | undefined;
  let year: number | undefined;
  let place: string | undefined;
  let typeDetail: string | undefined;
  let note: string | undefined;

  for (const child of node.children ?? []) {
    const tag = tagOf(child);
    const value = joinedValue(child);
    if (tag === 'DATE' && value) {
      dateRaw = value;
      year = extractYear(value);
    } else if (tag === 'PLAC' && value) {
      place = value;
    } else if (tag === 'TYPE' && value) {
      typeDetail = value;
    } else if (tag === 'NOTE' && value) {
      note = value;
    }
  }

  return { eventType, typeDetail, dateRaw, year, place, note };
}

function extractYear(dateRaw: string): number | undefined {
  // Accept any 4-digit year embedded in the string — handles
  // "12 MAY 1920", "1960", "ABT 1920", "BEF 1920", etc.
  const match = dateRaw.match(/\b(\d{3,4})\b/);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (Number.isFinite(n) && n >= 1 && n <= 9999) return n;
  return undefined;
}

// ============================================================================
// Low-level AST helpers
// ============================================================================

/**
 * parse-gedcom represents each GEDCOM line as a unist node. The tag
 * lives either in `.type` (for top-level records it prefixes with the
 * tag name) or inside `.data`. We try both because the lib's output
 * shape is not fully documented.
 */
function tagOf(node: AstNode): string | undefined {
  if (typeof node.type === 'string' && node.type.length > 0) {
    return node.type;
  }
  const data = node.data;
  if (data && typeof (data as { tag?: unknown }).tag === 'string') {
    return (data as { tag: string }).tag;
  }
  return undefined;
}

function valueOf(node: AstNode): string | undefined {
  // parse-gedcom puts scalar values on `.value` for things like DATE,
  // PLAC, SEX, NAME. For pointer tags (HUSB/WIFE/CHIL) it instead puts
  // the `@I1@` token into `.data.pointer`. We prefer pointer when
  // present so HUSB/WIFE/CHIL resolve correctly.
  const data = node.data as { pointer?: unknown } | undefined;
  const pointer = data?.pointer;
  if (typeof pointer === 'string' && pointer.length > 0) {
    return pointer;
  }
  if (typeof node.value === 'string' && node.value.length > 0) {
    return node.value;
  }
  return undefined;
}

/** Payload plus any CONT continuation lines under the node. */
function joinedValue(node: AstNode): string | undefined {
  const base = valueOf(node) ?? '';
  const contParts: string[] = [];
  for (const child of node.children ?? []) {
    if (tagOf(child) === 'CONT') {
      // CONT may carry an empty string (explicit blank line).
      contParts.push(typeof child.value === 'string' ? child.value : (valueOf(child) ?? ''));
    }
  }
  if (!base && contParts.length === 0) return undefined;
  if (contParts.length === 0) return base || undefined;
  return [base, ...contParts].join('\n');
}

function xrefOf(node: AstNode): string | undefined {
  const data = node.data;
  if (!data) return undefined;
  const x = (data as { xref_id?: unknown; xref?: unknown; pointer?: unknown });
  const candidate = x.xref_id ?? x.xref ?? x.pointer;
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  return undefined;
}

function detectLang(s: string | undefined): 'ar' | 'en' | undefined {
  if (!s) return undefined;
  // Arabic block U+0600..U+06FF
  return /[\u0600-\u06FF]/.test(s) ? 'ar' : 'en';
}
