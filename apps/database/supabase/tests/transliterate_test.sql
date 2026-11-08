-- pgTAP: algorithmic Latin→Arabic fold + override table.
BEGIN;
SELECT plan(14);

-- Override-backed canonical givens
SELECT is(public.transliterate_to_arabic('Ibrahim'),  'ابراهيم', 'Ibrahim -> ابراهيم (override)');
SELECT is(public.transliterate_to_arabic('Abraham'),  'ابراهيم', 'Abraham -> ابراهيم (override)');
SELECT is(public.transliterate_to_arabic('Ibraheem'), 'ابراهيم', 'Ibraheem -> ابراهيم (override)');
SELECT is(public.transliterate_to_arabic('Joseph'),   'يوسف',    'Joseph -> يوسف (override)');
SELECT is(public.transliterate_to_arabic('ابراهيم'),  'ابراهيم', 'already-Arabic passes through');

-- Algorithmic surnames (NOT in the override table)
SELECT is(public.transliterate_to_arabic('Khatib'),  'ختيب', 'Khatib algorithmic fold');
SELECT is(public.transliterate_to_arabic('Darwish'), 'درويش', 'Darwish algorithmic fold');
SELECT is(
  public.arabic_phonetic(public.transliterate_to_arabic('Khatib')),
  public.arabic_phonetic('خطيب'),
  'Khatib and خطيب share a phonetic key after fold');

SELECT is(
  public.normalize_arabic(public.transliterate_to_arabic('Abraham')),
  public.normalize_arabic('ابراهيم'),
  'Abraham and ابراهيم unify after transliterate + normalize');

-- Unknown Latin still produces Arabic letters via digraph rules
SELECT ok(
  public.transliterate_to_arabic('Zzxqq') ~ '[ء-ي]',
  'unknown Latin is algorithmically folded into Arabic script');

SELECT ok(
  (SELECT count(*) FROM public.name_transliteration_overrides) >= 20,
  'name_transliteration_overrides is seeded');

SELECT ok(
  (SELECT count(*) FROM public.name_variants WHERE canonical = 'ابراهيم') >= 3,
  'name_variants still seeded with Ibrahim variants');

-- Multi-token: given override + algorithmic surname
SELECT is(
  public.transliterate_to_arabic('Ahmed Khatib'),
  'احمد ختيب',
  'multi-token: override given + algorithmic surname');

SELECT is(
  public.arabic_phonetic(public.transliterate_to_arabic('Ahmed Khatib')),
  public.arabic_phonetic('احمد خطيب'),
  'Ahmed Khatib phonetically matches احمد خطيب');

SELECT finish();
ROLLBACK;
