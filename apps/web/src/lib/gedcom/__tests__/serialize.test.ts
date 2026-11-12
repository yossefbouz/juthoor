import { describe, expect, it } from 'vitest';

import { parseGedcom } from '../parse';
import { serializeGedcom } from '../serialize';
import type { GedcomSnapshot } from '../types';
import {
  ARABIC_UTF8_GEDCOM,
  MINIMAL_GEDCOM,
  MULTI_SPOUSE_GEDCOM,
} from './fixtures';

describe('serializeGedcom — round-trip', () => {
  function roundTrip(raw: string): GedcomSnapshot {
    const parsed = parseGedcom(raw);
    const serialized = serializeGedcom(parsed);
    return parseGedcom(serialized);
  }

  it('round-trips the minimal fixture with no loss of core fields', () => {
    const original = parseGedcom(MINIMAL_GEDCOM);
    const rt = roundTrip(MINIMAL_GEDCOM);

    expect(rt.persons).toHaveLength(original.persons.length);
    expect(rt.families).toHaveLength(original.families.length);

    const ahmad = rt.persons.find((p) => p.xref === '@I1@')!;
    expect(ahmad.gender).toBe('M');
    expect(ahmad.names[0].given).toBe('Ahmad');
    expect(ahmad.names[0].surname).toBe('Bouz');
    expect(ahmad.events.find((e) => e.eventType === 'BIRT')?.year).toBe(1920);

    const fam = rt.families[0];
    expect(fam.xref).toBe('@F1@');
    expect(fam.husbandXref).toBe('@I1@');
    expect(fam.wifeXref).toBe('@I2@');
    expect(fam.children.map((c) => c.childXref)).toEqual(['@I3@']);
  });

  it('round-trips a multi-spouse file preserving both FAM records', () => {
    const rt = roundTrip(MULTI_SPOUSE_GEDCOM);
    expect(rt.families).toHaveLength(2);
    expect(rt.families.every((f) => f.husbandXref === '@I1@')).toBe(true);
  });

  it('round-trips Arabic UTF-8 names', () => {
    const rt = roundTrip(ARABIC_UTF8_GEDCOM);
    const ahmad = rt.persons[0];
    expect(ahmad.names[0].given).toBe('أحمد');
    expect(ahmad.names[0].surname).toBe('البوز');
  });
});

describe('serializeGedcom — output format', () => {
  it('starts with 0 HEAD and ends with 0 TRLR', () => {
    const parsed = parseGedcom(MINIMAL_GEDCOM);
    const out = serializeGedcom(parsed);
    expect(out.split('\n')[0]).toMatch(/^0 HEAD$/);
    // TRLR must be the last non-empty line.
    const nonEmpty = out.trim().split('\n');
    expect(nonEmpty[nonEmpty.length - 1]).toMatch(/^0 TRLR$/);
  });

  it('exports GEDCOM 7.0 (VERS 7.0, SCHMA, no FORM LINEAGE-LINKED)', () => {
    const parsed = parseGedcom(MINIMAL_GEDCOM);
    const out = serializeGedcom(parsed);
    expect(out).toContain('2 VERS 7.0');
    expect(out).toContain('1 SCHMA');
    expect(out).toContain('2 TAG _UNRWA https://juthoor.org/gedcom/IDNO-UNRWA');
    expect(out).not.toContain('FORM LINEAGE-LINKED');
    expect(out).not.toContain('VERS 5.5.1');
  });

  it('uses CRLF-safe line separator: every line terminated by \\n', () => {
    const parsed = parseGedcom(MINIMAL_GEDCOM);
    const out = serializeGedcom(parsed);
    // All lines end with \n; no \r\n pairs (we emit LF-only, consumers handle both).
    expect(out.includes('\r')).toBe(false);
  });

  it('splits long notes with CONT lines', () => {
    const snap = parseGedcom(MINIMAL_GEDCOM);
    const longNote = 'A'.repeat(90) + ' ' + 'B'.repeat(90);
    const withNote = {
      ...snap,
      persons: snap.persons.map((p, i) =>
        i === 0 ? { ...p, notes: longNote } : p
      ),
    };
    const out = serializeGedcom(withNote);
    expect(out).toMatch(/1 NOTE A+/);
    expect(out).toMatch(/2 CONT /);
  });

  it('emits TRAN/ROMN and IDNO TYPE on GEDCOM 7 names/identifiers', () => {
    const out = serializeGedcom({
      header: { source: 'Juthoor' },
      families: [],
      persons: [
        {
          xref: '@I1@',
          gender: 'M',
          names: [
            {
              nameType: 'birth',
              given: 'أحمد',
              surname: 'البوز',
              raw: 'أحمد /البوز/',
              lang: 'ar',
              tran: 'أحمد /البوز/',
              romn: 'Ahmad /Bouz/',
            },
          ],
          events: [],
          idnos: [{ type: 'UNRWA', value: 'R-1' }],
        },
      ],
    });
    expect(out).toContain('1 NAME أحمد /البوز/');
    expect(out).toContain('2 TRAN أحمد /البوز/');
    expect(out).toContain('3 LANG ar');
    expect(out).toContain('2 TRAN Ahmad /Bouz/');
    expect(out).toContain('3 LANG latn');
    expect(out).toContain('1 IDNO R-1');
    expect(out).toContain('2 TYPE UNRWA');
  });
});
