/**
 * GEDCOM 5.5.1 serializer.
 *
 * Handwritten emitter (parse-gedcom only parses). Takes a
 * `GedcomSnapshot` and returns a valid .ged string that will re-parse
 * back into an equivalent snapshot — see round-trip test.
 *
 * Line format: `<level> [<xref>] <tag> [<value>]\n`. Indentation is
 * purely notational in the spec; levels must be numeric.
 */

import type {
  GedcomEvent,
  GedcomFamily,
  GedcomName,
  GedcomPerson,
  GedcomSnapshot,
} from './types';

export function serializeGedcom(snap: GedcomSnapshot): string {
  const lines: string[] = [];

  // ---- HEAD ----
  lines.push('0 HEAD');
  lines.push(`1 SOUR ${snap.header.source ?? 'Juthoor'}`);
  lines.push('2 NAME Juthoor Palestinian Roots Platform');
  lines.push('1 CHAR UTF-8');
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');

  // ---- Individuals ----
  for (const p of snap.persons) {
    emitPerson(lines, p);
  }

  // ---- Families ----
  for (const f of snap.families) {
    emitFamily(lines, f);
  }

  // ---- TRLR ----
  lines.push('0 TRLR');

  return lines.join('\n') + '\n';
}

function emitPerson(lines: string[], p: GedcomPerson): void {
  lines.push(`0 ${p.xref} INDI`);

  for (const name of p.names) {
    emitName(lines, name);
  }

  lines.push(`1 SEX ${p.gender}`);

  for (const event of p.events) {
    emitEvent(lines, event);
  }

  // Custom REFN tags (person_identifiers on IFT Admin full export).
  for (const refn of p.refns ?? []) {
    const safeType = refn.type.replace(/\s+/g, '_');
    const safeValue = refn.value.replace(/\n/g, ' ').trim();
    if (!safeValue) continue;
    lines.push(`1 REFN ${safeType}:${safeValue}`);
  }

  if (p.notes) {
    // Keep notes on one line for simplicity — CONT/CONC splitting is
    // only needed for lines >255 chars which we don't emit.
    lines.push(`1 NOTE ${p.notes.replace(/\n/g, ' ')}`);
  }
  for (const note of p.extraNotes ?? []) {
    const clean = note.replace(/\n/g, ' ').trim();
    if (clean) lines.push(`1 NOTE ${clean}`);
  }
}

function emitName(lines: string[], name: GedcomName): void {
  // Prefer the original raw line for round-trip fidelity; fall back to
  // reconstructing from given/surname.
  const body =
    name.raw ??
    [
      name.given ?? '',
      name.surname ? `/${name.surname}/` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

  lines.push(`1 NAME ${body}`);
  if (name.nameType && name.nameType !== 'birth') {
    lines.push(`2 TYPE ${name.nameType}`);
  }
}

function emitFamily(lines: string[], f: GedcomFamily): void {
  lines.push(`0 ${f.xref} FAM`);
  if (f.husbandXref) lines.push(`1 HUSB ${f.husbandXref}`);
  if (f.wifeXref) lines.push(`1 WIFE ${f.wifeXref}`);
  for (const child of f.children) {
    lines.push(`1 CHIL ${child.childXref}`);
    if (child.pedigree && child.pedigree !== 'birth') {
      lines.push(`2 PEDI ${child.pedigree}`);
    }
  }
  for (const event of f.events) {
    emitEvent(lines, event);
  }
}

function emitEvent(lines: string[], event: GedcomEvent): void {
  lines.push(`1 ${event.eventType}`);
  if (event.dateRaw) {
    lines.push(`2 DATE ${event.dateRaw}`);
  } else if (event.year !== undefined) {
    lines.push(`2 DATE ${event.year}`);
  }
  if (event.place) {
    lines.push(`2 PLAC ${event.place}`);
  }
}
