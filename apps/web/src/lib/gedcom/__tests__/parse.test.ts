import { describe, expect, it } from 'vitest';

import { parseGedcom } from '../parse';
import {
  ARABIC_UTF8_GEDCOM,
  GEDCOM7_MINIMAL,
  MINIMAL_GEDCOM,
  MULTI_SPOUSE_GEDCOM,
} from './fixtures';

describe('parseGedcom — minimal nuclear family', () => {
  const snapshot = parseGedcom(MINIMAL_GEDCOM);

  it('extracts all three persons with their xrefs', () => {
    const xrefs = snapshot.persons.map((p) => p.xref).sort();
    expect(xrefs).toEqual(['@I1@', '@I2@', '@I3@']);
  });

  it("parses Ahmad's given name, surname, and gender", () => {
    const ahmad = snapshot.persons.find((p) => p.xref === '@I1@');
    expect(ahmad).toBeDefined();
    expect(ahmad!.gender).toBe('M');

    const primaryName = ahmad!.names[0];
    expect(primaryName.given).toBe('Ahmad');
    expect(primaryName.surname).toBe('Bouz');
  });

  it("attaches Ahmad's BIRT + DEAT events with year and place", () => {
    const ahmad = snapshot.persons.find((p) => p.xref === '@I1@')!;

    const birt = ahmad.events.find((e) => e.eventType === 'BIRT');
    expect(birt).toBeDefined();
    expect(birt!.year).toBe(1920);
    expect(birt!.place).toBe('Jerusalem');

    const deat = ahmad.events.find((e) => e.eventType === 'DEAT');
    expect(deat).toBeDefined();
    expect(deat!.year).toBe(1990);
  });

  it('extracts the family with husband, wife, and one child', () => {
    expect(snapshot.families).toHaveLength(1);
    const fam = snapshot.families[0];
    expect(fam.xref).toBe('@F1@');
    expect(fam.husbandXref).toBe('@I1@');
    expect(fam.wifeXref).toBe('@I2@');
    expect(fam.children).toHaveLength(1);
    expect(fam.children[0].childXref).toBe('@I3@');
    expect(fam.children[0].pedigree).toBe('birth');
  });

  it('captures the MARR event on the family with year 1945', () => {
    const marr = snapshot.families[0].events.find(
      (e) => e.eventType === 'MARR'
    );
    expect(marr).toBeDefined();
    expect(marr!.year).toBe(1945);
  });

  it('extracts header metadata', () => {
    expect(snapshot.header.source).toBe('Juthoor');
    expect(snapshot.header.charset).toBe('UTF-8');
    // Fixtures without GEDC VERS default to 5.5.1 for detection.
    expect(snapshot.header.version).toBe('5.5.1');
  });
});

describe('parseGedcom — GEDCOM 7.0', () => {
  const snapshot = parseGedcom(GEDCOM7_MINIMAL);

  it('detects VERS 7.0 and optional SCHMA tags', () => {
    expect(snapshot.header.version).toBe('7.0');
    expect(snapshot.header.schemaTags?.some((t) => t.includes('UNRWA'))).toBe(
      true
    );
  });

  it('reads TRAN/ROMN under NAME and IDNO TYPE', () => {
    const p = snapshot.persons[0];
    expect(p.names[0].tran).toBe('أحمد /البوز/');
    expect(p.names[0].romn).toBe('Ahmad /Bouz/');
    expect(p.idnos).toEqual([
      expect.objectContaining({ type: 'UNRWA', value: 'UNRWA-42' }),
    ]);
  });

  it('reads EVEN TYPE DISPLACEMENT', () => {
    const even = snapshot.persons[0].events.find((e) => e.eventType === 'EVEN');
    expect(even).toMatchObject({
      typeDetail: 'DISPLACEMENT',
      year: 1948,
      place: 'Lebanon',
    });
  });
});

describe('parseGedcom — multi-spouse father', () => {
  const snapshot = parseGedcom(MULTI_SPOUSE_GEDCOM);

  it('returns two families both fathered by @I1@', () => {
    expect(snapshot.families).toHaveLength(2);
    const husbands = snapshot.families.map((f) => f.husbandXref);
    expect(husbands).toEqual(['@I1@', '@I1@']);
  });

  it('groups children under the correct family / mother', () => {
    const f1 = snapshot.families.find((f) => f.xref === '@F1@')!;
    const f2 = snapshot.families.find((f) => f.xref === '@F2@')!;
    expect(f1.wifeXref).toBe('@I2@');
    expect(f1.children.map((c) => c.childXref)).toEqual(['@I4@']);
    expect(f2.wifeXref).toBe('@I3@');
    expect(f2.children.map((c) => c.childXref)).toEqual(['@I5@']);
  });
});

describe('parseGedcom — Arabic UTF-8', () => {
  it('preserves Arabic given + surname round-trip safely', () => {
    const snapshot = parseGedcom(ARABIC_UTF8_GEDCOM);
    const ahmad = snapshot.persons[0];
    expect(ahmad.names[0].given).toBe('أحمد');
    expect(ahmad.names[0].surname).toBe('البوز');
  });
});

describe('parseGedcom — error cases', () => {
  it('throws on empty input', () => {
    expect(() => parseGedcom('')).toThrow();
  });

  it('handles GEDCOM with no persons gracefully', () => {
    const empty = `0 HEAD\n1 SOUR Juthoor\n0 TRLR\n`;
    const snapshot = parseGedcom(empty);
    expect(snapshot.persons).toEqual([]);
    expect(snapshot.families).toEqual([]);
  });
});
