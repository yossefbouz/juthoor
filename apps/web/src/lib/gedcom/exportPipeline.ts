/**
 * Build a `GedcomSnapshot` from all rows in a Supabase tree, ready to
 * feed to `serializeGedcom`.
 *
 * Uses existing `gedcom_xref` columns when present (round-trip
 * preservation); synthesises stable xrefs otherwise so a tree that
 * was built in the UI still exports cleanly.
 *
 * With `maskLivingPeople` (decision D5: everyone except the tree's IFT
 * Administrator), living people keep their names, sex and family links
 * but lose every event and note, and so do the families they are a
 * partner in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { isPresumedLiving } from '@/lib/privacy/lifeData';
import type { Database, Event, EventType, Person, PersonName } from '@/types/database';

import type {
  GedcomChildLink,
  GedcomEvent,
  GedcomFamily,
  GedcomName,
  GedcomPerson,
  GedcomSnapshot,
} from './types';

export interface ExportOptions {
  readonly maskLivingPeople?: boolean;
}

export async function exportTreeToSnapshot(
  supabase: SupabaseClient<Database>,
  treeId: string,
  options: ExportOptions = {}
): Promise<GedcomSnapshot> {
  const [personsRes, familiesRes, childrenRes, namesRes, eventsRes, placesRes] =
    await Promise.all([
      supabase.from('persons').select('*').eq('tree_id', treeId),
      supabase.from('families').select('*').eq('tree_id', treeId),
      supabase
        .from('family_children')
        .select('*, families!inner(tree_id)')
        .eq('families.tree_id', treeId),
      supabase.from('person_names').select('*'),
      supabase.from('events').select('*'),
      supabase.from('places').select('id, name_en, name_ar'),
    ]);

  for (const res of [
    personsRes,
    familiesRes,
    childrenRes,
    namesRes,
    eventsRes,
    placesRes,
  ]) {
    if (res.error) throw new Error(res.error.message);
  }

  const persons = personsRes.data ?? [];
  const families = familiesRes.data ?? [];
  const childLinks = (childrenRes.data ?? []).map(
    // strip the joined `families` so we only keep the child-link fields
    ({ families: _omit, ...rest }) => rest as unknown as {
      family_id: string;
      child_id: string;
      pedigree: 'birth' | 'adopted' | 'foster' | 'sealing' | 'other';
    }
  );
  const names = namesRes.data ?? [];
  const events = eventsRes.data ?? [];
  const places = placesRes.data ?? [];

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

    const mappedNames: GedcomName[] =
      personNames.length > 0
        ? personNames.map((n: PersonName) => ({
            nameType: n.name_type,
            given: n.given_name ?? undefined,
            surname: n.surname ?? undefined,
            raw: n.gedcom_name ?? undefined,
            lang: (n.lang === 'ar' ? 'ar' : 'en') as 'ar' | 'en',
          }))
        : [
            {
              nameType: 'birth' as const,
              given:
                p.display_name_ar ?? p.display_name_en ?? undefined,
              lang: p.display_name_ar ? ('ar' as const) : ('en' as const),
            },
          ];

    return {
      xref: personXref.get(p.id)!,
      gender: p.gender,
      names: mappedNames,
      events: personEvents.map((e: Event) =>
        toGedcomEvent(e, placeLookup)
      ),
      notes: masked ? undefined : (p.notes ?? undefined),
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
    header: { source: 'Juthoor', charset: 'UTF-8' },
  };
}

function toGedcomEvent(
  row: Event,
  placeLookup: Map<string, string>
): GedcomEvent {
  return {
    eventType: row.event_type as EventType,
    dateRaw: row.date_value ?? undefined,
    year: row.date_year ?? undefined,
    place:
      (row.place_id && placeLookup.get(row.place_id)) ??
      row.place_name ??
      undefined,
  };
}
