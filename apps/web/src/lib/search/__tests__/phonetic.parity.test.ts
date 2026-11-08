import { describe, expect, it } from 'vitest';
import { toArabicSync, transliterateLatinTokenToArabic } from '../phonetic';

/**
 * Parity with SQL transliterate_to_arabic /
 * transliterate_latin_token_to_arabic
 * (20261107190000_algorithmic_transliterate.sql).
 */
describe('toArabicSync ↔ SQL transliterate_to_arabic parity', () => {
  const overrideCases: ReadonlyArray<readonly [string, string]> = [
    ['Ibrahim', 'ابراهيم'],
    ['Ibraheem', 'ابراهيم'],
    ['Abraham', 'ابراهيم'],
    ['Ahmad', 'احمد'],
    ['Ahmed', 'احمد'],
    ['Mohammad', 'محمد'],
    ['Muhammad', 'محمد'],
    ['Yousef', 'يوسف'],
    ['Joseph', 'يوسف'],
    ['Omar', 'عمر'],
    ['Hassan', 'حسن'],
    ['Khaled', 'خالد'],
    ['Fatima', 'فاطمة'],
    ['Khalil', 'خليل'],
    ['Ali', 'علي'],
  ];

  it.each(overrideCases)('folds override %s → %s', (input, expected) => {
    expect(toArabicSync(input).arabic).toBe(expected);
  });

  it('passes already-Arabic input through unchanged', () => {
    expect(toArabicSync('ابراهيم').arabic).toBe('ابراهيم');
  });

  it('algorithmically folds unknown Latin surnames into Arabic script', () => {
    expect(toArabicSync('Khatib').arabic).toBe('ختيب');
    expect(toArabicSync('Darwish').arabic).toBe('درويش');
    expect(toArabicSync('Zzxqq').arabic).toMatch(/[\u0600-\u06FF]/);
  });

  it('folds multi-token override + algorithmic surname', () => {
    expect(toArabicSync('Ahmed Khatib').arabic).toBe('احمد ختيب');
  });
});

describe('transliterateLatinTokenToArabic digraphs', () => {
  it('maps kh/sh digraphs', () => {
    expect(transliterateLatinTokenToArabic('khatib')).toBe('ختيب');
    expect(transliterateLatinTokenToArabic('sharif')).toBe('شريف');
  });
});
