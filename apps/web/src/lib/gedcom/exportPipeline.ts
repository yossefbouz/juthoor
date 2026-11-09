/**
 * Build a `GedcomSnapshot` from all rows in a Supabase tree, ready to
 * feed to `serializeGedcom` (GEDCOM 7.0).
 *
 * Uses existing `gedcom_xref` columns when present (round-trip
 * preservation); synthesises stable xrefs otherwise so a tree that
 * was built in the UI still exports cleanly.
 *
 * With `maskLivingPeople` (decision D5: everyone except the tree's IFT
 * Administrator), living people keep their names, sex and family links
 * but lose every event and note, and so do the families they are a
 * partner in. Living status uses `isPresumedLiving` (D2 150-year rule
 * from death/birth events), not `persons.is_living`.
 *
 * IFT Admin full export (`maskLivingPeople: false`) also emits:
 *   - person_identifiers as IDNO + TYPE (UNRWA / HOSTCARD1948 / …) and NOTE
 *   - person_displacement as EVEN TYPE DISPLACEMENT / CAMPREGN when present
 *   - match-relevant fields already on the person: NAME + TRAN/ROMN and
 *     origin via BIRT PLAC (and an ORIGIN NOTE when a place is known)
 * Living-mask behaviour above stays unchanged (identifiers withheld).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isPresumedLiving } from '@/lib/privacy/lifeData';
import type {
  Database,
  Event,
  EventType,
  Family,
  Person,
  PersonName,
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

interface DisplacementRow {
  readonly person_id: string;
  readonly host_country_first: string | null;
  readonly host_country_current: string | null;
  readonly refugee_status: string | null;
  readonly camp_name: string | null;
  readonly displacement_year: number | null;
  readonly displacement_wave: string | null;
}

export interface ExportOptions {
  readonly maskLivingPeople?: boolean;
}

/** The API returns at most this many rows per request (Supabase `max_rows`). */
const PAGE_SIZE = 1000;

/** Reads every row of a query, one page at a time. */
async function readAll<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: readonly unknown[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

interface ChildLinkRow {
  readonly family_id: string;
  readonly child_id: string;
  readonly pedigree: 'birth' | 'adopted' | 'foster' | 'sealing' | 'other';
  readonly families?: unknown;
}

export async function exportTreeToSnapshot(
  supabase: SupabaseClient<Database>,
  treeId: string,
  options: ExportOptions = {}
): Promise<GedcomSnapshot> {
  // Names and events are scoped to this tree through their person or
  // family; on their own, those tables hold every tree the user can read.
  const includeIdentifiers = options.maskLivingPeople !== true;

  const [persons, families, childRows, names, personEvents, familyEvents, places, identifierRows, displacementRows] =
    await Promise.all([
      readAll<Person>((from, to) =>
        supabase
          .from('persons')
          .select('*')
          .eq('tree_id', treeId)
          .order('created_at')
          .order('id')
          .range(from, to)
      ),
      readAll<Family>((from, to) =>
        supabase
          .from('families')
          .select('*')
          .eq('tree_id', treeId)
          .order('created_at')
          .order('id')
          .range(from, to)
      ),
      readAll<ChildLinkRow>((from, to) =>
        supabase
          .from('family_children')
          .select('*, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('id')
          .range(from, to)
      ),
      readAll<PersonName>((from, to) =>
        supabase
          .from('person_names')
          .select('*, persons!inner(tree_id)')
          .eq('persons.tree_id', treeId)
          .order('id')
          .range(from, to)
      ),
      readAll<Event>((from, to) =>
        supabase
          .from('events')
          .select('*, persons!inner(tree_id)')
          .eq('persons.tree_id', treeId)
          .order('id')
          .range(from, to)
      ),
      readAll<Event>((from, to) =>
        supabase
          .from('events')
          .select('*, families!inner(tree_id)')
          .eq('families.tree_id', treeId)
          .order('id')
          .range(from, to)
      ),
      readAll<{ id: string; name_en: string | null; name_ar: string | null }>(
        (from, to) =>
          supabase
            .from('places')
            .select('id, name_en, name_ar')
            .order('id')
            .range(from, to)
      ),
      includeIdentifiers
        ? readAll<{
            person_id: string;
            id_type: string;
            id_value: string;
          }>((from, to) =>
            supabase
              .from('person_identifiers')
              .select('person_id, id_type, id_value, persons!inner(tree_id)')
              .eq('persons.tree_id', treeId)
              .order('id')
              .range(from, to)
          )
        : Promise.resolve(
            [] as { person_id: string; id_type: string; id_value: string }[]
          ),
      includeIdentifiers
        ? readAll<DisplacementRow>((from, to) =>
            supabase
              .from('person_displacement')
              .select(
                'person_id, host_country_first, host_country_current, refugee_status, camp_name, displacement_year, displacement_wave, persons!inner(tree_id)'
              )
              .eq('persons.tree_id', treeId)
              .order('person_id')
              .range(from, to)
          )
        : Promise.resolve([] as DisplacementRow[]),
    ]);

  // strip the joined `families` so we only keep the child-link fields
  const childLinks = childRows.map(({ families: _omit, ...rest }) => rest);
  const events = [...personEvents, ...familyEvents];

  const placeLookup = new Map<string, string>();
  for (const p of places) {
    if (p.name_en) placeLookup.set(p.id, p.name_en);
    else if (p.name_ar) placeLookup.set(p.id, p.name_ar);
  }

  // ---- Assign xrefs (collision-free) ----
  // Two pass: first use existing gedcom_xref values as-is; then
  // synthesise `@I<n>@`/`@F<n>@` for the remaining rows, skipping any
  // numeric suffix already taken.
  const personXref = new Map<string, string>();
  const takenPersonXrefs = new Set<string>();
  for (const p of persons as Person[]) {
    if (p.gedcom_xref) {
      personXref.set(p.id, p.gedcom_xref);
      takenPersonXrefs.add(p.gedcom_xref);
    }
  }
  let nextPersonIdx = 1;
  for (const p of persons as Person[]) {
    if (personXref.has(p.id)) continue;
    let candidate = `@I${nextPersonIdx}@`;
    while (takenPersonXrefs.has(candidate)) {
      nextPersonIdx++;
      candidate = `@I${nextPersonIdx}@`;
    }
    personXref.set(p.id, candidate);
    takenPersonXrefs.add(candidate);
    nextPersonIdx++;
  }

  const familyXref = new Map<string, string>();
  const takenFamilyXrefs = new Set<string>();
  for (const f of families) {
    if (f.gedcom_xref) {
      familyXref.set(f.id, f.gedcom_xref);
      takenFamilyXrefs.add(f.gedcom_xref);
    }
  }
  let nextFamilyIdx = 1;
  for (const f of families) {
    if (familyXref.has(f.id)) continue;
    let candidate = `@F${nextFamilyIdx}@`;
    while (takenFamilyXrefs.has(candidate)) {
      nextFamilyIdx++;
      candidate = `@F${nextFamilyIdx}@`;
    }
    familyXref.set(f.id, candidate);
    takenFamilyXrefs.add(candidate);
    nextFamilyIdx++;
  }

  // ---- Living people whose details are withheld ----
  const maskedPersonIds = new Set<string>();
  if (options.maskLivingPeople) {
    const deceased = new Set<string>();
    const birthYears = new Map<string, number>();
    for (const e of events as Event[]) {
      if (e.person_id === null) continue;
      if (e.event_type === 'DEAT') deceased.add(e.person_id);
      if (e.event_type === 'BIRT' && e.date_year !== null) {
        birthYears.set(e.person_id, e.date_year);
      }
    }
    for (const p of persons as Person[]) {
      const living = isPresumedLiving({
        hasDeath: deceased.has(p.id),
        birthYear: birthYears.get(p.id) ?? null,
      });
      if (living) maskedPersonIds.add(p.id);
    }
  }

  const identifiersByPerson = new Map<
    string,
    { id_type: string; id_value: string }[]
  >();
  for (const row of identifierRows) {
    const list = identifiersByPerson.get(row.person_id) ?? [];
    list.push({ id_type: row.id_type, id_value: row.id_value });
    identifiersByPerson.set(row.person_id, list);
  }

  const displacementByPerson = new Map<string, DisplacementRow>();
  for (const row of displacementRows) {
    displacementByPerson.set(row.person_id, row);
  }

  // ---- Build persons ----
  const gedcomPersons: GedcomPerson[] = persons.map((p: Person) => {
    const personNames = names
      .filter((n: PersonName) => n.person_id === p.id)
      .sort(
        (a: PersonName, b: PersonName) =>
          Number(b.is_primary) - Number(a.is_primary)
      );
    const masked = maskedPersonIds.has(p.id);
    const personEvents = masked
      ? []
      : events.filter((e: Event) => e.person_id === p.id);

    const mappedNames = buildPersonNames(p, personNames);

    const gedEvents = personEvents.map((e: Event) =>
      toGedcomEvent(e, placeLookup)
    );

    // Match-relevant fields already exported for every person:
    //   - names → NAME + TRAN/ROMN (above)
    //   - origin → BIRT PLAC when a birth event has a place
    // IFT Admin full export also attaches IDNO + displacement EVEN + ORIGIN NOTE.
    const extraNotes: string[] = [];
    const idnos: GedcomIdno[] = [];
    if (!masked && includeIdentifiers) {
      const ids = identifiersByPerson.get(p.id) ?? [];
      for (const id of ids) {
        const idnoType = mapIdTypeToIdno(id.id_type);
        idnos.push({
          type: idnoType,
          value: id.id_value,
          note: idnoType === 'ILID' ? 'restricted' : undefined,
        });
        extraNotes.push(`${idnoType}: ${id.id_value}`);
      }

      const disp = displacementByPerson.get(p.id);
      if (disp) {
        gedEvents.push(...displacementToEvents(disp));
      }

      const birthPlace = gedEvents.find(
        (e) => e.eventType === 'BIRT' && e.place
      )?.place;
      if (birthPlace) {
        extraNotes.push(`ORIGIN: ${birthPlace}`);
      }
    }

    return {
      xref: personXref.get(p.id)!,
      gender: p.gender,
      names: mappedNames,
      events: gedEvents,
      notes: masked ? undefined : (p.notes ?? undefined),
      idnos: idnos.length > 0 ? idnos : undefined,
      extraNotes: extraNotes.length > 0 ? extraNotes : undefined,
    };
  });

  // ---- Build families ----
  const gedcomFamilies: GedcomFamily[] = families.map((f) => {
    const myChildren: GedcomChildLink[] = childLinks
      .filter((link) => link.family_id === f.id)
      .map((link) => ({
        childXref: personXref.get(link.child_id) ?? '',
        pedigree: link.pedigree,
      }))
      .filter((c) => c.childXref !== '');

    const husbandXref =
      f.partner1_id !== null
        ? personXref.get(f.partner1_id) ?? undefined
        : undefined;
    const wifeXref =
      f.partner2_id !== null
        ? personXref.get(f.partner2_id) ?? undefined
        : undefined;

    // A marriage date or place is a detail of both partners.
    const partnerMasked =
      (f.partner1_id !== null && maskedPersonIds.has(f.partner1_id)) ||
      (f.partner2_id !== null && maskedPersonIds.has(f.partner2_id));
    const myEvents = partnerMasked
      ? []
      : events
          .filter((e: Event) => e.family_id === f.id)
          .map((e: Event) => toGedcomEvent(e, placeLookup));

    return {
      xref: familyXref.get(f.id)!,
      husbandXref,
      wifeXref,
      children: myChildren,
      events: myEvents,
    };
  });

  return {
    persons: gedcomPersons,
    families: gedcomFamilies,
    header: { source: 'Juthoor', charset: 'UTF-8', version: '7.0' },
  };
}

function toGedcomEvent(
  row: Event,
  placeLookup: Map<string, string>
): GedcomEvent {
  return {
    eventType: row.event_type as EventType,
    typeDetail: row.description ?? undefined,
    dateRaw: row.date_value ?? undefined,
    year: row.date_year ?? undefined,
    place:
      (row.place_id && placeLookup.get(row.place_id)) ??
      row.place_name ??
      undefined,
    note: row.notes ?? undefined,
  };
}

function formatNameBody(given?: string | null, surname?: string | null): string {
  return [given ?? '', surname ? `/${surname}/` : '']
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * One NAME record per person_names row, with TRAN (Arabic) / ROMN
 * (English phonetic) attached when both scripts are available.
 */
function buildPersonNames(
  p: Person,
  personNames: readonly PersonName[]
): GedcomName[] {
  if (personNames.length === 0) {
    const ar = p.display_name_ar ?? undefined;
    const en = p.display_name_en ?? undefined;
    const primary = ar ?? en;
    return [
      {
        nameType: 'birth' as const,
        given: primary,
        lang: ar ? ('ar' as const) : ('en' as const),
        raw: primary,
        tran: ar,
        romn: en && en !== ar ? en : undefined,
      },
    ];
  }

  const arRow = personNames.find((n) => n.lang === 'ar');
  const enRow = personNames.find((n) => n.lang === 'en');
  const displayEn = p.display_name_en ?? undefined;
  const displayAr = p.display_name_ar ?? undefined;

  return personNames.map((n) => {
    const lang = (n.lang === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
    const body =
      n.gedcom_name ??
      (formatNameBody(n.given_name, n.surname) || undefined);
    const arBody =
      (arRow
        ? arRow.gedcom_name ??
          (formatNameBody(arRow.given_name, arRow.surname) || undefined)
        : undefined) ?? displayAr;
    const enBody =
      (enRow
        ? enRow.gedcom_name ??
          (formatNameBody(enRow.given_name, enRow.surname) || undefined)
        : undefined) ?? displayEn;

    const isArabicScript = lang === 'ar' || /[\u0600-\u06FF]/.test(body ?? '');
    return {
      nameType: n.name_type,
      given: n.given_name ?? undefined,
      surname: n.surname ?? undefined,
      raw: n.gedcom_name ?? undefined,
      lang,
      tran: isArabicScript ? body ?? arBody ?? undefined : arBody ?? undefined,
      romn: !isArabicScript
        ? body ?? enBody ?? undefined
        : enBody && enBody !== body
          ? enBody
          : undefined,
    };
  });
}

/** Map `person_identifiers.id_type` → AIO2 IDNO TYPE. */
export function mapIdTypeToIdno(idType: string): string {
  const t = idType.trim().toLowerCase();
  if (t === 'unrwa_registration' || t === 'unrwa') return 'UNRWA';
  if (t === 'family_card_1948' || t === 'family_card' || t === 'hostcard1948') {
    return 'HOSTCARD1948';
  }
  if (t === 'pa_id' || t === 'palestinian_id' || t === 'paid') return 'PAID';
  if (t === 'pa_passport' || t === 'passport' || t === 'papassport') {
    return 'PAPASSPORT';
  }
  if (t === 'il_id' || t === 'israeli_id' || t === 'ilid') return 'ILID';
  return idType.replace(/\s+/g, '_').toUpperCase();
}

function displacementToEvents(disp: DisplacementRow): GedcomEvent[] {
  const out: GedcomEvent[] = [];
  const hasDisplacement =
    disp.displacement_year != null ||
    !!disp.displacement_wave ||
    !!disp.host_country_first ||
    !!disp.host_country_current ||
    !!disp.refugee_status;

  if (hasDisplacement) {
    const noteParts = [
      disp.displacement_wave ? `wave: ${disp.displacement_wave}` : null,
      disp.refugee_status ? `status: ${disp.refugee_status}` : null,
      disp.host_country_current &&
      disp.host_country_current !== disp.host_country_first
        ? `current host: ${disp.host_country_current}`
        : null,
    ].filter(Boolean) as string[];

    out.push({
      eventType: 'EVEN',
      typeDetail: 'DISPLACEMENT',
      year: disp.displacement_year ?? undefined,
      dateRaw:
        disp.displacement_year != null
          ? String(disp.displacement_year)
          : undefined,
      place: disp.host_country_first ?? disp.host_country_current ?? undefined,
      note: noteParts.length > 0 ? noteParts.join('; ') : undefined,
    });
  }

  if (disp.camp_name) {
    out.push({
      eventType: 'EVEN',
      typeDetail: 'CAMPREGN',
      place: disp.camp_name,
    });
  }

  return out;
}
