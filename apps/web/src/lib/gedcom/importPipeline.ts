/**
 * Orchestrates GEDCOM snapshot → Supabase inserts.
 *
 * Split into three passes so each one is idempotent by (tree_id, gedcom_xref):
 *   1. Persons — create INDI rows; remember xref→uuid mapping.
 *   2. Families — create FAM rows with resolved partner uuids.
 *   3. Children — create family_children rows using both mappings.
 *
 * Returns a summary for the UI: counts + any unmatched places.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Place } from '@/types/database';

import { matchPlace } from './placeMatching';
import type { GedcomSnapshot } from './types';

export interface ImportSummary {
  readonly treeId: string;
  readonly personsInserted: number;
  readonly familiesInserted: number;
  readonly childLinksInserted: number;
  readonly eventsInserted: number;
  readonly unmatchedPlaces: readonly string[];
  readonly errors: readonly string[];
}

export async function importGedcomSnapshot(
  supabase: SupabaseClient<Database>,
  treeId: string,
  snapshot: GedcomSnapshot
): Promise<ImportSummary> {
  const errors: string[] = [];
  const unmatchedPlaces = new Set<string>();

  // Load places once so placeMatching can run in memory during import.
  const { data: placesData, error: placesErr } = await supabase
    .from('places')
    .select('id, name_ar, name_en');
  if (placesErr) {
    throw new Error(`Could not load places: ${placesErr.message}`);
  }
  const places: readonly Pick<Place, 'id' | 'name_ar' | 'name_en'>[] =
    placesData ?? [];

  // ---- Pass 1: persons ----
  const xrefToPersonId = new Map<string, string>();
  let personsInserted = 0;
  let eventsInserted = 0;

  for (const p of snapshot.persons) {
    const primary = p.names[0];
    const given = primary?.given ?? null;
    const surname = primary?.surname ?? null;

    const displayAr = joinName(given, surname, p.names, 'ar');
    const displayEn = joinName(given, surname, p.names, 'en');

    const { data: inserted, error } = await supabase
      .from('persons')
      .insert({
        tree_id: treeId,
        gender: p.gender,
        display_name_ar: displayAr,
        display_name_en: displayEn,
        gedcom_xref: p.xref,
        notes: null,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      errors.push(`Failed to insert ${p.xref}: ${error?.message}`);
      continue;
    }
    xrefToPersonId.set(p.xref, inserted.id);
    personsInserted++;

    // Free-text notes live on person_notes (D1). No persons.notes fallback
    // (that column is readable by every tree viewer).
    if (p.notes && p.notes.trim() !== '' && p.notes !== 'placeholder') {
      const { error: noteErr } = await supabase.rpc('upsert_person_note', {
        p_person_id: inserted.id,
        p_body: p.notes,
      });
      if (noteErr) {
        errors.push(`Note skipped for ${p.xref}: ${noteErr.message}`);
      }
    }

    // Primary name row. FRS: female primary must be maiden, never married.
    // If GEDCOM marks a woman's primary NAME as married, store maiden as
    // primary and keep the married form as a secondary searchable row.
    const rawPrimaryType = primary?.nameType ?? 'birth';
    const femaleMarriedPrimary =
      p.gender === 'F' && rawPrimaryType === 'married';
    const primaryNameType = femaleMarriedPrimary
      ? 'maiden'
      : p.gender === 'F' && (rawPrimaryType === 'birth' || !primary?.nameType)
        ? 'maiden'
        : rawPrimaryType;

    await supabase.from('person_names').insert({
      person_id: inserted.id,
      name_type: primaryNameType,
      is_primary: true,
      lang: primary?.lang ?? 'en',
      given_name: given,
      surname,
      gedcom_name: primary?.raw ?? null,
    });

    if (femaleMarriedPrimary && primary) {
      await supabase.from('person_names').insert({
        person_id: inserted.id,
        name_type: 'married',
        is_primary: false,
        lang: primary.lang ?? 'en',
        given_name: given,
        surname,
        gedcom_name: primary.raw ?? null,
      });
    }

    // Events (EVEN.TYPE → events.description; NOTE → events.notes)
    for (const ev of p.events) {
      const match = matchPlace(ev.place, places);
      if (ev.place && match.placeId === null) {
        unmatchedPlaces.add(ev.place);
      }
      await supabase.from('events').insert({
        person_id: inserted.id,
        event_type: ev.eventType,
        date_value: ev.dateRaw ?? null,
        date_year: ev.year ?? null,
        place_id: match.placeId,
        place_name: match.placeId === null ? match.rawName || null : null,
        description: ev.typeDetail ?? null,
        notes: ev.note ?? null,
      });
      eventsInserted++;
    }
  }

  // ---- Pass 2: families ----
  const xrefToFamilyId = new Map<string, string>();
  let familiesInserted = 0;

  for (const fam of snapshot.families) {
    const p1 = fam.husbandXref
      ? xrefToPersonId.get(fam.husbandXref)
      : undefined;
    const p2 = fam.wifeXref ? xrefToPersonId.get(fam.wifeXref) : undefined;

    const { data: inserted, error } = await supabase
      .from('families')
      .insert({
        tree_id: treeId,
        partner1_id: p1 ?? null,
        partner2_id: p2 ?? null,
        gedcom_xref: fam.xref,
      })
      .select('id')
      .single();
    if (error || !inserted) {
      errors.push(`Failed to insert ${fam.xref}: ${error?.message}`);
      continue;
    }
    xrefToFamilyId.set(fam.xref, inserted.id);
    familiesInserted++;

    // Family events (MARR/DIV)
    for (const ev of fam.events) {
      const match = matchPlace(ev.place, places);
      if (ev.place && match.placeId === null) {
        unmatchedPlaces.add(ev.place);
      }
      await supabase.from('events').insert({
        family_id: inserted.id,
        event_type: ev.eventType,
        date_value: ev.dateRaw ?? null,
        date_year: ev.year ?? null,
        place_id: match.placeId,
        place_name: match.placeId === null ? match.rawName || null : null,
        description: ev.typeDetail ?? null,
        notes: ev.note ?? null,
      });
      eventsInserted++;
    }
  }

  // ---- Pass 3: child links ----
  let childLinksInserted = 0;
  for (const fam of snapshot.families) {
    const familyId = xrefToFamilyId.get(fam.xref);
    if (!familyId) continue;
    for (const link of fam.children) {
      const childId = xrefToPersonId.get(link.childXref);
      if (!childId) {
        errors.push(
          `Child ${link.childXref} referenced by ${fam.xref} was not inserted`
        );
        continue;
      }
      const { error } = await supabase.from('family_children').insert({
        family_id: familyId,
        child_id: childId,
        pedigree: link.pedigree,
      });
      if (error) {
        errors.push(`Failed to link ${link.childXref}: ${error.message}`);
        continue;
      }
      childLinksInserted++;
    }
  }

  return {
    treeId,
    personsInserted,
    familiesInserted,
    childLinksInserted,
    eventsInserted,
    unmatchedPlaces: Array.from(unmatchedPlaces),
    errors,
  };
}

/**
 * Pick the best name for a display field in the requested language.
 * Prefers lang-tagged NAME rows, then TRAN (ar) / ROMN (en), then the
 * primary NAME when its script matches.
 */
function joinName(
  given: string | null | undefined,
  surname: string | null | undefined,
  names: readonly GedcomSnapshot['persons'][number]['names'][number][],
  lang: 'ar' | 'en'
): string | null {
  const langMatch = names.find((n) => n.lang === lang);
  if (langMatch) {
    const g = langMatch.given ?? '';
    const s = langMatch.surname ?? '';
    return `${g} ${s}`.trim() || null;
  }

  // GEDCOM 7: TRAN carries Arabic script; ROMN carries phonetic/English.
  for (const n of names) {
    if (lang === 'ar' && n.tran) return n.tran.trim() || null;
    if (lang === 'en' && n.romn) return n.romn.trim() || null;
  }

  // Only fall back if the primary matches the target lang family.
  // Prevents Arabic primary name from landing in display_name_en.
  const g = given ?? '';
  const s = surname ?? '';
  const joined = `${g} ${s}`.trim();
  if (!joined) return null;
  const isArabic = /[\u0600-\u06FF]/.test(joined);
  if (lang === 'ar' && isArabic) return joined;
  if (lang === 'en' && !isArabic) return joined;
  return null;
}
