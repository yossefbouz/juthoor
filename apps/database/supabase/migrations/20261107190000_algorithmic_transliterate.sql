-- Replace the hard-coded name dictionary fold with:
--   1) algorithmic Latin digraph → Arabic letter mapping (no name table required)
--   2) name_transliteration_overrides for unique / non-phonetic exceptions
--      (Joseph→يوسف, Abraham→ابراهيم, …)
-- Matching still runs in Arabic after fold: transliterate → normalize → phonetic.

-- ── Overrides for names letter-rules cannot recover ─────────────────────────
CREATE TABLE IF NOT EXISTS public.name_transliteration_overrides (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  latin   text NOT NULL,
  arabic  text NOT NULL,
  notes   text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT name_transliteration_overrides_latin_lower
    CHECK (latin = lower(latin)),
  CONSTRAINT name_transliteration_overrides_latin_unique UNIQUE (latin)
);

CREATE INDEX IF NOT EXISTS idx_name_translit_overrides_latin
  ON public.name_transliteration_overrides (latin);

ALTER TABLE public.name_transliteration_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS name_transliteration_overrides_read
  ON public.name_transliteration_overrides;
CREATE POLICY name_transliteration_overrides_read
  ON public.name_transliteration_overrides
  FOR SELECT TO authenticated, anon
  USING (true);

COMMENT ON TABLE public.name_transliteration_overrides IS
  'Exceptional Latin→Arabic name folds that letter/digraph rules cannot derive (e.g. Joseph→يوسف). Looked up before the algorithmic transliterator.';

INSERT INTO public.name_transliteration_overrides (latin, arabic, notes) VALUES
  -- Biblical / Western given names with no letter-faithful Arabic spelling
  ('joseph',   'يوسف',   'Western given → Arabic Yusuf'),
  ('abraham',  'ابراهيم', 'Biblical; letter rules would not yield ابراهيم'),
  ('abrahem',  'ابراهيم', NULL),
  ('ibrahim',  'ابراهيم', 'Canonical given (stable exact form)'),
  ('ibraheem', 'ابراهيم', NULL),
  ('ebrahim',  'ابراهيم', NULL),
  ('george',   'جورج',   'Western given'),
  ('john',     'جون',    'Western given'),
  ('paul',     'بولس',   'Western/Christian given'),
  ('peter',    'بطرس',   'Western/Christian given'),
  ('michael',  'ميخائيل', NULL),
  ('michel',   'ميشيل',  NULL),
  ('david',    'داود',   NULL),
  ('moses',    'موسى',   NULL),
  ('solomon',  'سليمان', NULL),
  ('samuel',   'صموئيل', NULL),
  ('thomas',   'توما',   NULL),
  ('philip',   'فيليب',  NULL),
  ('philippe', 'فيليب',  NULL),
  -- Common given names kept exact so feature keys stay stable across releases
  ('ahmad',    'احمد',   NULL),
  ('ahmed',    'احمد',   NULL),
  ('achmed',   'احمد',   NULL),
  ('mohammad', 'محمد',   NULL),
  ('mohammed', 'محمد',   NULL),
  ('muhammad', 'محمد',   NULL),
  ('muhammed', 'محمد',   NULL),
  ('yousef',   'يوسف',   NULL),
  ('youssef',  'يوسف',   NULL),
  ('yusuf',    'يوسف',   NULL),
  ('yusef',    'يوسف',   NULL),
  ('omar',     'عمر',    NULL),
  ('umar',     'عمر',    NULL),
  ('hassan',   'حسن',    NULL),
  ('hasan',    'حسن',    NULL),
  ('khaled',   'خالد',   NULL),
  ('khalid',   'خالد',   NULL),
  ('fatima',   'فاطمة',  NULL),
  ('fatma',    'فاطمة',  NULL),
  ('fatema',   'فاطمة',  NULL),
  ('aisha',    'عائشة',  NULL),
  ('ayesha',   'عائشة',  NULL),
  ('samaa',    'سماء',   NULL),
  ('khalil',   'خليل',   NULL),
  ('ali',      'علي',    NULL),
  -- Family / nisba forms that need the definite article intact
  ('ajrami',   'العجرمي', NULL),
  ('alajrami', 'العجرمي', NULL),
  ('al-ajrami','العجرمي', NULL),
  ('hajj',     'الحاج',   NULL),
  ('alhajj',   'الحاج',   NULL),
  ('al-hajj',  'الحاج',   NULL),
  ('masri',    'المصري',  NULL),
  ('almasri',  'المصري',  NULL),
  ('al-masri', 'المصري',  NULL)
ON CONFLICT (latin) DO UPDATE
  SET arabic = EXCLUDED.arabic,
      notes  = COALESCE(EXCLUDED.notes, public.name_transliteration_overrides.notes);

-- Keep the older name_variants dictionary in sync as reference data.
INSERT INTO public.name_variants (canonical, variant, kind) VALUES
  ('يوسف', 'joseph', 'latin'),
  ('ابراهيم', 'abraham', 'latin'),
  ('جورج', 'george', 'latin'),
  ('جون', 'john', 'latin'),
  ('داود', 'david', 'latin'),
  ('موسى', 'moses', 'latin'),
  ('سليمان', 'solomon', 'latin')
ON CONFLICT (canonical, variant) DO NOTHING;

-- ── Algorithmic digraph / letter fold (IMMUTABLE, no table) ─────────────────
CREATE OR REPLACE FUNCTION public.transliterate_latin_token_to_arabic(txt text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text := lower(btrim(coalesce(txt, '')));
  out text := '';
  i int := 1;
  n int;
  dig2 text;
  dig3 text;
  ch text;
  article boolean := false;
BEGIN
  IF v = '' THEN RETURN ''; END IF;

  -- Strip combining marks / punctuation except hyphen (handled as break).
  v := regexp_replace(v, '[^a-z''`ʾʿ-]+', '', 'g');
  IF v = '' THEN RETURN ''; END IF;

  -- Definite article prefixes common in surnames.
  IF v ~ '^(al|el|ul|ad|ar|as|at|az|an)-' THEN
    article := true;
    v := substr(v, 4);
  ELSIF v ~ '^(al|el|ul)[a-z]' AND length(v) > 3 THEN
    -- almasri / elhajj without hyphen
    IF substr(v, 1, 2) IN ('al', 'el', 'ul') THEN
      article := true;
      v := substr(v, 3);
    END IF;
  END IF;

  n := length(v);
  WHILE i <= n LOOP
    dig3 := substr(v, i, 3);
    dig2 := substr(v, i, 2);
    ch := substr(v, i, 1);

    -- 3-letter digraphs
    IF dig3 = 'sch' THEN
      out := out || 'ش'; i := i + 3; CONTINUE;
    END IF;

    -- 2-letter digraphs (consonant sounds first)
    IF dig2 = 'kh' THEN out := out || 'خ'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'sh' THEN out := out || 'ش'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'th' THEN out := out || 'ث'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'dh' THEN out := out || 'ذ'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'gh' THEN out := out || 'غ'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'ph' THEN out := out || 'ف'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'ch' THEN out := out || 'ش'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'zh' THEN out := out || 'ج'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'dj' THEN out := out || 'ج'; i := i + 2; CONTINUE;
    ELSIF dig2 IN ('aa', 'ae') THEN out := out || 'ا'; i := i + 2; CONTINUE;
    ELSIF dig2 IN ('ee', 'ii', 'iy') THEN out := out || 'ي'; i := i + 2; CONTINUE;
    ELSIF dig2 IN ('oo', 'uu', 'ou', 'ow') THEN out := out || 'و'; i := i + 2; CONTINUE;
    ELSIF dig2 IN ('ay', 'ai', 'ei', 'ey') THEN out := out || 'ي'; i := i + 2; CONTINUE;
    ELSIF dig2 = 'aw' THEN out := out || 'و'; i := i + 2; CONTINUE;
    END IF;

    -- Apostrophe / ayn markers
    IF ch IN ('''', '`', 'ʾ') THEN
      out := out || 'ء'; i := i + 1; CONTINUE;
    ELSIF ch = 'ʿ' THEN
      out := out || 'ع'; i := i + 1; CONTINUE;
    ELSIF ch = '-' THEN
      i := i + 1; CONTINUE;
    END IF;

    -- Vowels: keep word-initial; keep i/u/o as long letters; drop short medial a/e
    IF ch IN ('a', 'e', 'i', 'o', 'u') THEN
      IF out = '' AND NOT article THEN
        -- Word-initial vowel → alef (Ibrahim, Omar, Ahmed without override)
        IF ch IN ('o', 'u') THEN out := out || 'و'; ELSE out := out || 'ا'; END IF;
      ELSIF ch IN ('i') THEN
        out := out || 'ي';
      ELSIF ch IN ('o', 'u') THEN
        out := out || 'و';
      END IF;
      -- medial a/e intentionally dropped (short vowels absent in Arabic writing)
      i := i + 1;
      CONTINUE;
    END IF;

    -- Consonants
    out := out || CASE ch
      WHEN 'b' THEN 'ب'
      WHEN 'c' THEN 'ك'
      WHEN 'd' THEN 'د'
      WHEN 'f' THEN 'ف'
      WHEN 'g' THEN 'ج'
      WHEN 'h' THEN 'ه'
      WHEN 'j' THEN 'ج'
      WHEN 'k' THEN 'ك'
      WHEN 'l' THEN 'ل'
      WHEN 'm' THEN 'م'
      WHEN 'n' THEN 'ن'
      WHEN 'p' THEN 'ب'
      WHEN 'q' THEN 'ق'
      WHEN 'r' THEN 'ر'
      WHEN 's' THEN 'س'
      WHEN 't' THEN 'ت'
      WHEN 'v' THEN 'ف'
      WHEN 'w' THEN 'و'
      WHEN 'x' THEN 'كس'
      WHEN 'y' THEN 'ي'
      WHEN 'z' THEN 'ز'
      ELSE ''
    END;
    i := i + 1;
  END LOOP;

  IF article AND out <> '' THEN
    out := 'ال' || out;
  END IF;

  -- Collapse accidental duplicate letters from digraph overlap
  out := regexp_replace(out, '(.)\1+', '\1', 'g');
  RETURN out;
END $$;

COMMENT ON FUNCTION public.transliterate_latin_token_to_arabic(text) IS
  'Algorithmic Latin→Arabic digraph/letter fold for a single token. No name dictionary. Used by transliterate_to_arabic after override lookup.';

REVOKE ALL ON FUNCTION public.transliterate_latin_token_to_arabic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transliterate_latin_token_to_arabic(text) TO authenticated, anon;

-- ── Public fold: overrides first, then algorithm per token ───────────────────
-- STABLE (not IMMUTABLE) because it reads name_transliteration_overrides.
CREATE OR REPLACE FUNCTION public.transliterate_to_arabic(txt text)
RETURNS text
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  raw text := btrim(coalesce(txt, ''));
  parts text[];
  part text;
  key text;
  folded text;
  override text;
  out_parts text[] := ARRAY[]::text[];
BEGIN
  IF raw = '' THEN RETURN raw; END IF;
  -- Already Arabic script → leave for normalize_arabic / arabic_phonetic.
  IF raw ~ '[ء-ي]' THEN RETURN raw; END IF;

  -- Split on whitespace; keep hyphenated surnames as one token (al-masri).
  parts := regexp_split_to_array(raw, '\s+');
  FOREACH part IN ARRAY parts LOOP
    IF part IS NULL OR part = '' THEN CONTINUE; END IF;
    key := lower(part);
    SELECT o.arabic INTO override
      FROM public.name_transliteration_overrides o
     WHERE o.latin = key
     LIMIT 1;
    IF override IS NOT NULL THEN
      out_parts := array_append(out_parts, override);
    ELSE
      folded := public.transliterate_latin_token_to_arabic(part);
      IF folded IS NULL OR folded = '' THEN
        out_parts := array_append(out_parts, part);
      ELSE
        out_parts := array_append(out_parts, folded);
      END IF;
    END IF;
  END LOOP;

  RETURN btrim(array_to_string(out_parts, ' '));
END $$;

COMMENT ON FUNCTION public.transliterate_to_arabic(text) IS
  'Latin→Arabic fold for matching/search. Looks up name_transliteration_overrides for exceptional names, then applies algorithmic digraph transliteration. Runs before normalize_arabic/arabic_phonetic.';

REVOKE ALL ON FUNCTION public.transliterate_to_arabic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transliterate_to_arabic(text) TO authenticated, anon;
