import { describe, expect, it } from 'vitest';
import {
  toArabicSync,
  toEnglishPhonetic,
  transliterateLatinTokenToArabic,
} from '../phonetic';

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

describe('toEnglishPhonetic', () => {
  it('romanizes common Arabic letters and digraphs', () => {
    // Simple letter map (no short-vowel insertion): أحمد → Ahmd, not Ahmad.
    expect(toEnglishPhonetic('أحمد')).toBe('Ahmd');
    expect(toEnglishPhonetic('خالد')).toBe('Khald');
    expect(toEnglishPhonetic('شريف')).toBe('Shryf');
    expect(toEnglishPhonetic('ثابت')).toBe('Thabt');
    expect(toEnglishPhonetic('ذاكر')).toBe('Dhakr');
    expect(toEnglishPhonetic('غسان')).toBe('Ghsan');
    expect(toEnglishPhonetic('قاسم')).toBe('Qasm');
  });

  it('maps ع/ء to apostrophe and ة to a/h', () => {
    expect(toEnglishPhonetic('عمر')).toBe("'mr");
    expect(toEnglishPhonetic('فاطمة')).toBe('Fatma');
    expect(toEnglishPhonetic('شاء')).toBe("Sha'");
  });

  it('prefixes ال as al-', () => {
    expect(toEnglishPhonetic('الحاج')).toBe('al-Haj');
    expect(toEnglishPhonetic('البوز')).toBe('al-Bwz');
  });

  it('handles multi-token names and empty input', () => {
    expect(toEnglishPhonetic('')).toBe('');
    expect(toEnglishPhonetic('  ')).toBe('');
    expect(toEnglishPhonetic('أحمد خالد')).toBe('Ahmd Khald');
  });
});
