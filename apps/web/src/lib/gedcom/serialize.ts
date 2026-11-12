/**
 * GEDCOM 7.0 serializer.
 *
 * Handwritten emitter (parse-gedcom only parses). Takes a
 * `GedcomSnapshot` and returns a valid .ged string that will re-parse
 * back into an equivalent snapshot — see round-trip test.
 *
 * Emits GEDC VERS 7.0 (no FORM LINEAGE-LINKED). Custom IDNO/EVEN TYPE
 * values are declared in HEAD.SCHMA per AIO2.
 *
 * Line format: `<level> [<xref>] <tag> [<value>]\n`. Indentation is
 * purely notational in the spec; levels must be numeric.
 */

import type {
  GedcomEvent,
  GedcomFamily,
  GedcomIdno,
  GedcomName,
  GedcomPerson,
  GedcomSnapshot,
} from './types';

/** Soft max payload length before CONT continuation (AIO2: >80 or >200). */
const CONT_LIMIT = 80;

/** Extension TYPE values declared in HEAD.SCHMA. */
const SCHEMA_TAGS: readonly { uri: string; tag: string }[] = [
  { uri: 'https://juthoor.org/gedcom/IDNO-UNRWA', tag: 'UNRWA' },
  { uri: 'https://juthoor.org/gedcom/IDNO-HOSTCARD1948', tag: 'HOSTCARD1948' },
  { uri: 'https://juthoor.org/gedcom/IDNO-PAID', tag: 'PAID' },
  { uri: 'https://juthoor.org/gedcom/IDNO-PAPASSPORT', tag: 'PAPASSPORT' },
  { uri: 'https://juthoor.org/gedcom/IDNO-ILID', tag: 'ILID' },
  { uri: 'https://juthoor.org/gedcom/EVEN-DISPLACEMENT', tag: 'DISPLACEMENT' },
  { uri: 'https://juthoor.org/gedcom/EVEN-CAMPREGN', tag: 'CAMPREGN' },
];

export function serializeGedcom(snap: GedcomSnapshot): string {
  const lines: string[] = [];

  // ---- HEAD (GEDCOM 7) ----
  lines.push('0 HEAD');
  lines.push('1 GEDC');
  lines.push('2 VERS 7.0');
  lines.push('1 SCHMA');
  for (const entry of SCHEMA_TAGS) {
    // GEDCOM 7: TAG then URI; extension tags are _prefixed.
    const tag = entry.tag.startsWith('_') ? entry.tag : `_${entry.tag}`;
    lines.push(`2 TAG ${tag} ${entry.uri}`);
  }
  lines.push(`1 SOUR ${snap.header.source ?? 'Juthoor'}`);
  lines.push('2 NAME Juthoor Palestinian Roots Platform');
  // GEDCOM 7 mandates UTF-8; CHAR is omitted (still accepted on import).

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

  // Prefer GEDCOM 7 IDNO; fall back to mapping legacy REFN.
  const idnos = p.idnos?.length
    ? p.idnos
    : (p.refns ?? []).map((r) => ({
        type: mapLegacyRefnType(r.type),
        value: r.value,
      }));
  for (const idno of idnos) {
    emitIdno(lines, idno);
  }

  if (p.notes) {
    emitContiguous(lines, 1, 'NOTE', p.notes.replace(/\n/g, ' '));
  }
  for (const note of p.extraNotes ?? []) {
    const clean = note.replace(/\n/g, ' ').trim();
    if (clean) emitContiguous(lines, 1, 'NOTE', clean);
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

  const safeBody = body.replace(/[\r\n]+/g, ' ').trim();
  lines.push(`1 NAME ${safeBody}`);
  if (name.nameType && name.nameType !== 'birth') {
    // GEDCOM 7 TYPE payloads are uppercase tokens.
    lines.push(`2 TYPE ${String(name.nameType).toUpperCase()}`);
  }
  if (name.tran) {
    lines.push(`2 TRAN ${name.tran.replace(/[\r\n]+/g, ' ').trim()}`);
    lines.push('3 LANG ar');
  }
  // GEDCOM 7 dropped ROMN as a structure; emit romanization as TRAN/LATN.
  if (name.romn) {
    lines.push(`2 TRAN ${name.romn.replace(/[\r\n]+/g, ' ').trim()}`);
    lines.push('3 LANG latn');
  }
}

function emitIdno(lines: string[], idno: GedcomIdno): void {
  const safeValue = idno.value.replace(/\n/g, ' ').trim();
  if (!safeValue) return;
  const safeType = String(idno.type).replace(/\s+/g, '_').toUpperCase();
  emitContiguous(lines, 1, 'IDNO', safeValue);
  lines.push(`2 TYPE ${safeType}`);
  if (idno.note) {
    emitContiguous(lines, 2, 'NOTE', idno.note.replace(/\n/g, ' '));
  } else if (safeType === 'ILID') {
    // AIO2: restricted visibility flag on Israeli-issued ID.
    lines.push('2 NOTE restricted');
  }
}

function emitFamily(lines: string[], f: GedcomFamily): void {
  lines.push(`0 ${f.xref} FAM`);
  if (f.husbandXref) lines.push(`1 HUSB ${f.husbandXref}`);
  if (f.wifeXref) lines.push(`1 WIFE ${f.wifeXref}`);
  for (const child of f.children) {
    lines.push(`1 CHIL ${child.childXref}`);
    if (child.pedigree && child.pedigree !== 'birth') {
      lines.push(`2 PEDI ${String(child.pedigree).toUpperCase()}`);
    }
  }
  for (const event of f.events) {
    emitEvent(lines, event);
  }
}

function emitEvent(lines: string[], event: GedcomEvent): void {
  lines.push(`1 ${event.eventType}`);
  if (event.typeDetail) {
    lines.push(
      `2 TYPE ${String(event.typeDetail).replace(/[\r\n]+/g, ' ').trim()}`,
    );
  }
  if (event.dateRaw) {
    lines.push(`2 DATE ${String(event.dateRaw).replace(/[\r\n]+/g, ' ').trim()}`);
  } else if (event.year !== undefined) {
    lines.push(`2 DATE ${event.year}`);
  }
  if (event.place) {
    lines.push(`2 PLAC ${event.place.replace(/[\r\n]+/g, ' ').trim()}`);
  }
  if (event.note) {
    emitContiguous(lines, 2, 'NOTE', event.note.replace(/\n/g, ' '));
  }
}

/**
 * Emit a tag whose value may exceed CONT_LIMIT, splitting with CONT.
 */
function emitContiguous(
  lines: string[],
  level: number,
  tag: string,
  text: string
): void {
  const cleaned = text.trim();
  if (!cleaned) return;
  const chunks = splitForCont(cleaned, CONT_LIMIT);
  lines.push(`${level} ${tag} ${chunks[0]}`);
  for (let i = 1; i < chunks.length; i++) {
    lines.push(`${level + 1} CONT ${chunks[i]}`);
  }
}

function splitForCont(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    // Prefer breaking on a space near the limit.
    let cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

/** Map older REFN type strings onto AIO2 IDNO TYPE values. */
function mapLegacyRefnType(type: string): string {
  const t = type.trim().toLowerCase();
  if (t === 'unrwa_registration' || t === 'unrwa') return 'UNRWA';
  if (t === 'family_card_1948' || t === 'family_card' || t === 'hostcard1948') {
    return 'HOSTCARD1948';
  }
  if (t === 'pa_id' || t === 'palestinian_id' || t === 'paid') return 'PAID';
  if (t === 'pa_passport' || t === 'passport' || t === 'papassport') {
    return 'PAPASSPORT';
  }
  if (t === 'il_id' || t === 'israeli_id' || t === 'ilid') return 'ILID';
  return type.replace(/\s+/g, '_').toUpperCase();
}
