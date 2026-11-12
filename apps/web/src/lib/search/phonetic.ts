/**
 * Client-side phonetic/transliteration helper.
 *
 * Prefer jslingua when available. Otherwise use the same path as Postgres:
 *   1) name_transliteration_overrides (unique / non-phonetic exceptions)
 *   2) algorithmic Latin digraph → Arabic letter fold
 *
 * Must stay in lockstep with:
 *   apps/database/supabase/migrations/20261107190000_algorithmic_transliterate.sql
 */

export type TransliteratedInput = {
  original: string;
  arabic: string | null; // null if input is empty
};

const ARABIC_RANGE = /[\u0600-\u06FF]/;

function containsArabic(s: string): boolean {
  return ARABIC_RANGE.test(s);
}

/**
 * Exceptional Latin→Arabic folds that letter rules cannot derive.
 * Mirrors public.name_transliteration_overrides (seed subset used by sync path).
 */
const NAME_TRANSLITERATION_OVERRIDES: Record<string, string> = {
  joseph: 'يوسف',
  abraham: 'ابراهيم',
  abrahem: 'ابراهيم',
  ibrahim: 'ابراهيم',
  ibraheem: 'ابراهيم',
  ebrahim: 'ابراهيم',
  george: 'جورج',
  john: 'جون',
  paul: 'بولس',
  peter: 'بطرس',
  michael: 'ميخائيل',
  michel: 'ميشيل',
  david: 'داود',
  moses: 'موسى',
  solomon: 'سليمان',
  samuel: 'صموئيل',
  thomas: 'توما',
  philip: 'فيليب',
  philippe: 'فيليب',
  ahmad: 'احمد',
  ahmed: 'احمد',
  achmed: 'احمد',
  mohammad: 'محمد',
  mohammed: 'محمد',
  muhammad: 'محمد',
  muhammed: 'محمد',
  yousef: 'يوسف',
  youssef: 'يوسف',
  yusuf: 'يوسف',
  yusef: 'يوسف',
  omar: 'عمر',
  umar: 'عمر',
  hassan: 'حسن',
  hasan: 'حسن',
  khaled: 'خالد',
  khalid: 'خالد',
  fatima: 'فاطمة',
  fatma: 'فاطمة',
  fatema: 'فاطمة',
  aisha: 'عائشة',
  ayesha: 'عائشة',
  samaa: 'سماء',
  khalil: 'خليل',
  ali: 'علي',
  ajrami: 'العجرمي',
  alajrami: 'العجرمي',
  'al-ajrami': 'العجرمي',
  hajj: 'الحاج',
  alhajj: 'الحاج',
  'al-hajj': 'الحاج',
  masri: 'المصري',
  almasri: 'المصري',
  'al-masri': 'المصري',
};

/** Algorithmic digraph/letter fold for one Latin token. Parity with SQL. */
export function transliterateLatinTokenToArabic(txt: string): string {
  let v = txt.trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/[^a-z'`ʾʿ-]+/g, '');
  if (!v) return '';

  let article = false;
  if (/^(al|el|ul|ad|ar|as|at|az|an)-/.test(v)) {
    article = true;
    v = v.slice(3);
  } else if (/^(al|el|ul)[a-z]/.test(v) && v.length > 3) {
    article = true;
    v = v.slice(2);
  }

  let out = '';
  let i = 0;
  while (i < v.length) {
    const dig3 = v.slice(i, i + 3);
    const dig2 = v.slice(i, i + 2);
    const ch = v[i];

    if (dig3 === 'sch') {
      out += 'ش';
      i += 3;
      continue;
    }

    const digraphs: Record<string, string> = {
      kh: 'خ',
      sh: 'ش',
      th: 'ث',
      dh: 'ذ',
      gh: 'غ',
      ph: 'ف',
      ch: 'ش',
      zh: 'ج',
      dj: 'ج',
      aa: 'ا',
      ae: 'ا',
      ee: 'ي',
      ii: 'ي',
      iy: 'ي',
      oo: 'و',
      uu: 'و',
      ou: 'و',
      ow: 'و',
      ay: 'ي',
      ai: 'ي',
      ei: 'ي',
      ey: 'ي',
      aw: 'و',
    };
    if (dig2 in digraphs) {
      out += digraphs[dig2];
      i += 2;
      continue;
    }

    if (ch === "'" || ch === '`' || ch === 'ʾ') {
      out += 'ء';
      i += 1;
      continue;
    }
    if (ch === 'ʿ') {
      out += 'ع';
      i += 1;
      continue;
    }
    if (ch === '-') {
      i += 1;
      continue;
    }

    if ('aeiou'.includes(ch)) {
      if (out === '' && !article) {
        out += ch === 'o' || ch === 'u' ? 'و' : 'ا';
      } else if (ch === 'i') {
        out += 'ي';
      } else if (ch === 'o' || ch === 'u') {
        out += 'و';
      }
      i += 1;
      continue;
    }

    const consonants: Record<string, string> = {
      b: 'ب',
      c: 'ك',
      d: 'د',
      f: 'ف',
      g: 'ج',
      h: 'ه',
      j: 'ج',
      k: 'ك',
      l: 'ل',
      m: 'م',
      n: 'ن',
      p: 'ب',
      q: 'ق',
      r: 'ر',
      s: 'س',
      t: 'ت',
      v: 'ف',
      w: 'و',
      x: 'كس',
      y: 'ي',
      z: 'ز',
    };
    out += consonants[ch] ?? '';
    i += 1;
  }

  if (article && out) out = `ال${out}`;
  return out.replace(/(.)\1+/g, '$1');
}

function fallbackTransliterate(input: string): string | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const folded = parts.map((part) => {
    const key = part.toLowerCase();
    const override = NAME_TRANSLITERATION_OVERRIDES[key];
    if (override) return override;
    const algo = transliterateLatinTokenToArabic(part);
    return algo || part;
  });

  const joined = folded.join(' ').trim();
  return joined || null;
}

/**
 * Transliterate arbitrary user input to Arabic. Prefers jslingua when
 * available, falls back to overrides + algorithmic digraph fold.
 */
export async function toArabic(input: string): Promise<TransliteratedInput> {
  const trimmed = input.trim();
  if (!trimmed) return { original: input, arabic: null };
  if (containsArabic(trimmed)) return { original: trimmed, arabic: trimmed };

  try {
    const mod = (await import('jslingua')) as unknown as {
      default?: {
        nservices?: (svc: string) => string[];
        gservice?: (svc: string, lang: string) => unknown;
      };
      nservices?: (svc: string) => string[];
      gservice?: (svc: string, lang: string) => unknown;
    };
    const api = mod.default ?? mod;
    const gservice = api.gservice;
    if (typeof gservice === 'function') {
      const trans = gservice('Trans', 'ara') as
        | { trans?: (s: string, method: string) => string }
        | null;
      if (trans && typeof trans.trans === 'function') {
        const result = trans.trans(trimmed, 'buckwalter');
        if (result && containsArabic(result)) {
          return { original: trimmed, arabic: result };
        }
      }
    }
  } catch {
    // swallow; fall through
  }

  return { original: trimmed, arabic: fallbackTransliterate(trimmed) };
}

/**
 * Synchronous best-effort transliteration — overrides + algorithmic fold.
 * Useful inside event handlers where you can't await.
 */
export function toArabicSync(input: string): TransliteratedInput {
  const trimmed = input.trim();
  if (!trimmed) return { original: input, arabic: null };
  if (containsArabic(trimmed)) return { original: trimmed, arabic: trimmed };
  return { original: trimmed, arabic: fallbackTransliterate(trimmed) };
}

/** Strip Arabic combining marks (tashkeel / tatweel) before romanization. */
const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Simple Arabic → Latin romanization for English phonetic auto-fill.
 * Digraphs: خ=kh, ش=sh, ث=th, ذ=dh, غ=gh, ق=q, ع=', ء=', ة=a/h, ال=al-.
 */
/** Common undiacritized Arabic given names → readable English (avoid "Mhmd"). */
const ARABIC_GIVEN_EN: Record<string, string> = {
  محمد: 'Muhammad',
  محمّد: 'Muhammad',
  احمد: 'Ahmad',
  أحمد: 'Ahmad',
  ابراهيم: 'Ibrahim',
  إبراهيم: 'Ibrahim',
  يوسف: 'Yusuf',
  محمود: 'Mahmoud',
  علي: 'Ali',
  على: 'Ali',
  حسن: 'Hasan',
  حسين: 'Hussein',
  خليل: 'Khalil',
  خالد: 'Khaled',
  شريف: 'Sharif',
  ثابت: 'Thabit',
  ذاكر: 'Dhaker',
  غسان: 'Ghassan',
  قاسم: 'Qasim',
  عمر: 'Omar',
  عثمان: 'Uthman',
  فاطمة: 'Fatima',
  مريم: 'Maryam',
  عائشة: 'Aisha',
  خديجة: 'Khadija',
  سارة: 'Sarah',
  نور: 'Nour',
  رنا: 'Rana',
};

export function toEnglishPhonetic(arabic: string): string {
  const trimmed = arabic.trim().replace(ARABIC_MARKS, '');
  if (!trimmed) return '';

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens
    .map((token) => {
      const key = token.replace(ARABIC_MARKS, '');
      if (ARABIC_GIVEN_EN[key]) return ARABIC_GIVEN_EN[key];
      return insertImpliedVowels(romanizeArabicToken(token));
    })
    .filter(Boolean)
    .join(' ');
}

/** Soften consonant clusters so undiacritized names are not vowel-less. */
function insertImpliedVowels(token: string): string {
  if (!token || token.length < 3) return token;
  // Digraph + consonant (Ghsan → Ghasan), then remaining bare pairs (Ahmd → if not overridden).
  let out = token.replace(
    /(kh|sh|th|dh|gh)(?=[bcdfghjklmnpqrstvwxyz])/gi,
    '$1a',
  );
  out = out.replace(
    /([bcdfghjklmnpqrstvwxyz])([bcdfghjklmnpqrstvwxyz])/gi,
    (full, a: string, b: string) => {
      const digraph = `${a}${b}`.toLowerCase();
      if (['kh', 'sh', 'th', 'dh', 'gh'].includes(digraph)) return full;
      return `${a}a${b}`;
    },
  );
  return out;
}

function romanizeArabicToken(token: string): string {
  let i = 0;
  let out = '';

  if (token.startsWith('ال') && token.length > 2) {
    out += 'al-';
    i = 2;
  }

  while (i < token.length) {
    const ch = token[i];
    const digraphs: Record<string, string> = {
      خ: 'kh',
      ش: 'sh',
      ث: 'th',
      ذ: 'dh',
      غ: 'gh',
    };
    if (ch in digraphs) {
      out += digraphs[ch];
      i += 1;
      continue;
    }

    if (ch === 'ة') {
      // Word-final ta marbuta → a; otherwise h.
      out += i === token.length - 1 ? 'a' : 'h';
      i += 1;
      continue;
    }

    const letters: Record<string, string> = {
      ا: 'a',
      أ: 'a',
      إ: 'i',
      آ: 'a',
      ب: 'b',
      ت: 't',
      ج: 'j',
      ح: 'h',
      د: 'd',
      ر: 'r',
      ز: 'z',
      س: 's',
      ص: 's',
      ض: 'd',
      ط: 't',
      ظ: 'z',
      ع: "'",
      ف: 'f',
      ق: 'q',
      ك: 'k',
      ل: 'l',
      م: 'm',
      ن: 'n',
      ه: 'h',
      و: 'w',
      ي: 'y',
      ى: 'a',
      ء: "'",
      ؤ: "'",
      ئ: "'",
      ة: 'a',
    };
    if (ch in letters) {
      out += letters[ch];
    } else if (/[A-Za-z0-9'-]/.test(ch)) {
      out += ch;
    }
    i += 1;
  }

  return capitalizePhoneticToken(out);
}

function capitalizePhoneticToken(token: string): string {
  if (!token) return '';
  // Keep al- lowercase article; capitalize the rest.
  if (token.startsWith('al-') && token.length > 3) {
    return `al-${token[3].toUpperCase()}${token.slice(4)}`;
  }
  return token[0].toUpperCase() + token.slice(1);
}
