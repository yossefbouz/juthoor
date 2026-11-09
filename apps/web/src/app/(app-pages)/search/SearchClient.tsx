'use client';

import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState, useTransition, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Search as SearchIcon,
  Loader2,
  SlidersHorizontal,
  X,
  Users,
  Sparkles,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { SearchResult } from '@/lib/search/zodSchemas';
import type { PersonView } from '@/lib/tree/types';
import { PersonHoverCard } from '@/components/tree/PersonHoverCard';
import { VillageCombobox } from '@/components/search/VillageCombobox';
import { GenderPicker } from '@/components/search/GenderPicker';
import { YearRangeInput } from '@/components/search/YearRangeInput';
import { ScoreBreakdownPopover } from '@/components/search/ScoreBreakdownPopover';
import { DegreeChip } from '@/components/search/DegreeChip';
import { DegreesDialog } from '@/components/search/DegreesDialog';
import { RequestAccessDialog } from '@/components/search/RequestAccessDialog';
import {
  DistrictSelect,
  districtsFromPlaces,
  placeMatchesDistrict,
} from '@/components/search/DistrictSelect';
import { isDegreesOk, type DegreesResult } from '@/data/user/degrees';
import { kinshipLabel } from '@/lib/search/relationLabels';
import { Lock } from 'lucide-react';

type Village = {
  id: string;
  name_ar: string;
  name_en: string | null;
  district_ar: string | null;
  district_en: string | null;
};

type Query = {
  q: string;
  given: string;
  surname: string;
  father: string;
  mother: string;
  paternalGrandfather: string;
  paternalGreatGrandfather: string;
  placeId: string | null;
  district: string | null;
  birthYear: string;
  yearWindow: number;
  gender: 'M' | 'F' | null;
};

export function SearchClient({
  initialResults,
  initialQuery,
  villages,
  hasQuery,
  serverError,
  degreesByPersonId,
  selfPersonId,
}: {
  initialResults: SearchResult[];
  initialQuery: Query;
  villages: Village[];
  hasQuery: boolean;
  serverError: string | null;
  degreesByPersonId: Record<string, DegreesResult>;
  selfPersonId: string | null;
}) {
  const [activeDegrees, setActiveDegrees] = useState<DegreesResult>(null);
  const [requestTarget, setRequestTarget] = useState<{ treeId: string; treeName: string } | null>(null);
  const { t, locale, dir } = useLocale();
  const isAR = locale === 'ar';
  const Arrow = isAR ? ArrowLeft : ArrowRight;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState<Query>(initialQuery);
  const [advanced, setAdvanced] = useState<boolean>(
    Boolean(
      initialQuery.given ||
        initialQuery.surname ||
        initialQuery.father ||
        initialQuery.mother ||
        initialQuery.placeId ||
        initialQuery.birthYear ||
        initialQuery.gender,
    ),
  );

  const districts = useMemo(() => districtsFromPlaces(villages), [villages]);
  const villagesInDistrict = useMemo(
    () => villages.filter((v) => placeMatchesDistrict(v, query.district)),
    [villages, query.district],
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.q.trim()) params.set('q', query.q.trim());
    if (query.given.trim()) params.set('given', query.given.trim());
    if (query.surname.trim()) params.set('surname', query.surname.trim());
    if (query.father.trim()) params.set('father', query.father.trim());
    if (query.mother.trim()) params.set('mother', query.mother.trim());
    if (query.paternalGrandfather.trim()) params.set('paternalGrandfather', query.paternalGrandfather.trim());
    if (query.paternalGreatGrandfather.trim()) params.set('paternalGreatGrandfather', query.paternalGreatGrandfather.trim());
    if (query.district) params.set('district', query.district);
    if (query.placeId) params.set('placeId', query.placeId);
    if (query.birthYear.trim()) {
      params.set('birthYear', query.birthYear.trim());
      params.set('yearWindow', String(query.yearWindow));
    }
    if (query.gender) params.set('gender', query.gender);
    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
  }

  function clearAll() {
    setQuery({ q: '', given: '', surname: '', father: '', mother: '', paternalGrandfather: '', paternalGreatGrandfather: '', placeId: null, district: null, birthYear: '', yearWindow: 5, gender: null });
    router.push('/search');
  }

  const hasAny =
    query.q.trim() ||
    query.given.trim() ||
    query.surname.trim() ||
    query.father.trim() ||
    query.mother.trim() ||
    query.placeId ||
    query.birthYear.trim();

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--jt-olive-100)_0%,_transparent_65%)] opacity-60" />
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10 md:py-16">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 text-center"
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <Sparkles className="h-3 w-3" />
            {t('الشجرة الأم', 'The Mother Tree')}
          </p>
          <h1 className="text-4xl font-bold text-[var(--jt-olive-900)] md:text-5xl" style={{ fontFamily: 'var(--jt-font-display)' }}>
            {t('ابحث عن ذويك', 'Find your family')}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[var(--jt-stone-600)]">
            {t(
              'اكتب اسمًا بالعربية أو الإنجليزية. نبحث بالتطابق الصوتي عبر كل الشجرات العامّة والمُشتركة.',
              'Type a name in Arabic or English. Phonetic matching across all public and shared trees.',
            )}
          </p>
        </motion.header>

        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          onSubmit={submit}
          className="relative rounded-[2rem] border border-[var(--jt-olive-200)]/50 bg-[var(--card)] p-4 shadow-[var(--jt-shadow-md)] md:p-6"
        >
          {/* Main search input */}
          <div className="flex items-center gap-2 rounded-full border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 px-4 py-3 focus-within:border-[var(--jt-olive-400)] focus-within:ring-2 focus-within:ring-[var(--jt-olive-200)]">
            <SearchIcon className="h-5 w-5 flex-shrink-0 text-[var(--jt-stone-500)]" />
            <input
              type="search"
              value={query.q}
              onChange={(e) => setQuery({ ...query, q: e.target.value })}
              placeholder={t('أحمد، Ibrahim، Deir Yassin...', 'Ahmad, Ibraheem, Deir Yassin…')}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--jt-stone-400)]"
              style={{ fontFamily: isAR ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
              autoFocus
              aria-label={t('البحث', 'Search')}
            />
            {query.q && (
              <button
                type="button"
                onClick={() => setQuery({ ...query, q: '' })}
                className="rounded-full p-1 text-[var(--jt-stone-400)] hover:bg-[var(--jt-stone-100)] hover:text-[var(--jt-stone-700)]"
                aria-label={t('مسح', 'Clear')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {advanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field
                    label={t('الاسم الأول', 'Given name')}
                    value={query.given}
                    onChange={(v) => setQuery({ ...query, given: v })}
                    placeholder={t('أحمد', 'Ahmad')}
                    locale={locale}
                  />
                  <Field
                    label={t('اللقب', 'Surname')}
                    value={query.surname}
                    onChange={(v) => setQuery({ ...query, surname: v })}
                    placeholder={t('العجرمي', 'Al-Ajrami')}
                    locale={locale}
                  />
                  <Field
                    label={t('اسم الأب', "Father's name")}
                    value={query.father}
                    onChange={(v) => setQuery({ ...query, father: v })}
                    placeholder={t('أحمد', 'Ahmad')}
                    locale={locale}
                  />
                  <Field
                    label={t('اسم الأم', "Mother's name")}
                    value={query.mother}
                    onChange={(v) => setQuery({ ...query, mother: v })}
                    placeholder={t('فاطمة', 'Fatima')}
                    locale={locale}
                  />
                  <Field
                    label={t('الجد لأب', 'Paternal grandfather')}
                    value={query.paternalGrandfather}
                    onChange={(v) => setQuery({ ...query, paternalGrandfather: v })}
                    placeholder={t('محمود', 'Mahmoud')}
                    locale={locale}
                  />
                  <Field
                    label={t('أبو الجد لأب', 'Paternal great-grandfather')}
                    value={query.paternalGreatGrandfather}
                    onChange={(v) => setQuery({ ...query, paternalGreatGrandfather: v })}
                    placeholder={t('إبراهيم', 'Ibrahim')}
                    locale={locale}
                  />
                  <label className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      <MapPin className="h-3 w-3" />
                      {t('اللواء / القضاء', 'District')}
                    </span>
                    <DistrictSelect
                      districts={districts}
                      value={query.district}
                      onChange={(key) =>
                        setQuery({
                          ...query,
                          district: key,
                          placeId:
                            key && query.placeId && !villages.filter((v) => placeMatchesDistrict(v, key)).some((v) => v.id === query.placeId)
                              ? null
                              : query.placeId,
                        })
                      }
                      locale={locale}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                      <MapPin className="h-3 w-3" />
                      {t('أصل العائلة', 'Village of origin')}
                    </span>
                    <VillageCombobox
                      villages={villagesInDistrict}
                      value={query.placeId}
                      onChange={(id) => setQuery({ ...query, placeId: id })}
                      locale={locale}
                      placeholder={t('ابحث عن قرية...', 'Search a village…')}
                    />
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <YearRangeInput
                      year={query.birthYear}
                      window={query.yearWindow}
                      onYear={(v) => setQuery({ ...query, birthYear: v })}
                      onWindow={(v) => setQuery({ ...query, yearWindow: v })}
                      label={t('سنة الميلاد', 'Birth year')}
                      hint={t('سنوات', 'years')}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                    <Calendar className="h-3 w-3" />
                    {t('الجنس', 'Gender')}
                  </span>
                  <GenderPicker
                    value={query.gender}
                    onChange={(v) => setQuery({ ...query, gender: v })}
                    labels={{ any: t('الكل', 'Any'), male: t('ذكر', 'Male'), female: t('أنثى', 'Female') }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--jt-stone-600)] transition-colors hover:bg-[var(--jt-stone-100)] hover:text-[var(--jt-olive-700)]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {advanced ? t('إخفاء التفاصيل', 'Hide filters') : t('بحث متقدّم', 'Advanced filters')}
            </button>
            <div className="flex items-center gap-2">
              {hasAny && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-semibold text-[var(--jt-stone-500)] underline underline-offset-4 hover:text-[var(--jt-terra-600)]"
                >
                  {t('مسح الكل', 'Clear all')}
                </button>
              )}
              <button
                type="submit"
                disabled={isPending || !hasAny}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-700)] px-6 py-2.5 text-sm font-semibold text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)] transition-all hover:bg-[var(--jt-olive-800)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
                {t('ابحث', 'Search')}
              </button>
            </div>
          </div>
        </motion.form>

        <div className="mt-10">
          {serverError && (
            <div className="mb-6 rounded-2xl border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)]/60 p-5 text-sm text-[var(--jt-terra-700)]">
              {serverError}
            </div>
          )}

          {!hasQuery && !serverError ? (
            <EmptyIntro t={t} isAR={isAR} />
          ) : initialResults.length === 0 ? (
            <NoResults t={t} />
          ) : (
            <div className="space-y-3">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
                {t(
                  `${initialResults.length} نتيجة`,
                  `${initialResults.length} ${initialResults.length === 1 ? 'match' : 'matches'}`,
                )}
              </p>
              {initialResults.map((r, i) => (
                <ResultCard
                  key={r.person_id}
                  result={r}
                  index={i}
                  t={t}
                  locale={locale}
                  Arrow={Arrow}
                  degrees={degreesByPersonId[r.person_id] ?? null}
                  isSelf={selfPersonId === r.person_id}
                  onShowDegrees={setActiveDegrees}
                  onRequestAccess={() => setRequestTarget({ treeId: r.tree_id, treeName: r.tree_name })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <DegreesDialog
        open={activeDegrees !== null}
        onClose={() => setActiveDegrees(null)}
        data={activeDegrees}
        locale={locale}
        t={t}
      />

      {requestTarget && (
        <RequestAccessDialog
          open={true}
          onClose={() => setRequestTarget(null)}
          treeId={requestTarget.treeId}
          treeName={requestTarget.treeName}
          t={t}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  locale,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  locale: 'ar' | 'en';
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--jt-stone-800)] outline-none placeholder:text-[var(--jt-stone-400)] focus:border-[var(--jt-olive-400)] focus:ring-2 focus:ring-[var(--jt-olive-100)]"
        style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
      />
    </label>
  );
}


function searchResultToPersonView(result: SearchResult): PersonView {
  return {
    id: result.person_id,
    gender: result.gender ?? 'U',
    displayNameAr: result.display_name_ar,
    displayNameEn: result.display_name_en,
    isPlaceholder: false,
    birthYear: result.birth_year,
    // Do not hardcode deathYear: null — that made hover show "present" for
    // long-dead people when only birth_year is known from search.
    deathYear: null,
    hasDeath: false,
    isLiving: undefined,
    placeOfOriginId: result.origin_place_id,
    birthPlaceAr: result.origin_name_ar,
  };
}

function ResultCard({
  result,
  index,
  t,
  locale,
  Arrow,
  degrees,
  isSelf,
  onShowDegrees,
  onRequestAccess,
}: {
  result: SearchResult;
  index: number;
  t: <T extends string>(ar: T, en: T) => T;
  locale: 'ar' | 'en';
  Arrow: React.ComponentType<{ className?: string }>;
  degrees: DegreesResult;
  isSelf: boolean;
  onShowDegrees: (d: DegreesResult) => void;
  onRequestAccess: () => void;
}) {
  const isLocked = !result.tree_is_accessible;
  const resolvedName =
    locale === 'ar'
      ? result.display_name_ar ||
        [result.primary_given, result.primary_surname].filter(Boolean).join(' ') ||
        result.display_name_en ||
        null
      : result.display_name_en ||
        [result.primary_given, result.primary_surname].filter(Boolean).join(' ') ||
        result.display_name_ar ||
        null;
  const label = resolvedName ?? (isLocked ? t('شخصٌ في هذه الشجرة', 'Someone in this tree') : '—');
  const pctScore = Math.round(Math.min(1, result.score) * 100);
  const confidence = pctScore >= 70 ? 'high' : pctScore >= 45 ? 'med' : 'low';
  const confColor =
    confidence === 'high'
      ? 'var(--jt-confidence-certain)'
      : confidence === 'med'
        ? 'var(--jt-confidence-likely)'
        : 'var(--jt-confidence-possible)';
  const confLabel =
    confidence === 'high' ? t('تطابق عالٍ', 'High match') : confidence === 'med' ? t('محتمل', 'Likely') : t('ممكن', 'Possible');
  const origin = result.origin_name_ar || result.origin_name_en;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.04 }}
    >
      <div
        onClick={() => {
          if (isLocked) {
            onRequestAccess();
          } else {
            window.location.href = `/tree/${result.tree_id}/person/${result.person_id}`;
          }
        }}
        role="button"
        tabIndex={0}
        className={`group flex cursor-pointer items-center gap-5 rounded-3xl border bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--jt-shadow-md)] ${
          isLocked
            ? 'border-[var(--jt-stone-300)]/60 hover:border-[var(--jt-gold-500)]'
            : 'border-[var(--jt-stone-200)] hover:border-[var(--jt-olive-300)]'
        }`}
      >
        <span
          className={`inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-2xl font-bold ${
            isLocked
              ? 'bg-[var(--jt-stone-200)]/70 text-[var(--jt-stone-500)]'
              : 'bg-[var(--jt-olive-100)] text-[var(--jt-olive-800)]'
          }`}
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {isLocked ? <Lock className="h-5 w-5" /> : (label ?? '·').trim().slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {isLocked ? (
              <span
                className="text-xl font-bold italic text-[var(--jt-stone-500)]"
                style={{ fontFamily: 'var(--jt-font-display)' }}
              >
                {label}
              </span>
            ) : (
              <PersonHoverCard person={searchResultToPersonView(result)}>
                <span
                  className="text-xl font-bold text-[var(--jt-olive-900)]"
                  style={{ fontFamily: 'var(--jt-font-display)' }}
                >
                  {label}
                </span>
              </PersonHoverCard>
            )}
            {!isLocked && result.display_name_ar && result.display_name_en && (
              <span className="text-xs text-[var(--jt-stone-500)]">
                {locale === 'ar' ? result.display_name_en : result.display_name_ar}
              </span>
            )}
            {!isLocked && result.birth_year && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--jt-stone-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--jt-stone-600)]">
                <Calendar className="h-2.5 w-2.5" />
                {result.birth_year}
              </span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--jt-stone-500)]">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {t('من شجرة', 'From')} <span className="font-semibold text-[var(--jt-stone-700)]">{result.tree_name}</span>
            </span>
            {origin && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-semibold text-[var(--jt-stone-700)]">{origin}</span>
              </span>
            )}
            {result.tree_is_public ? (
              <span className="rounded-full bg-[var(--jt-gold-100)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-gold-700)]">
                {t('عامّة', 'Public')}
              </span>
            ) : (
              <span className="rounded-full bg-[var(--jt-stone-200)]/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-stone-600)]">
                {t('خاصّة', 'Private')}
              </span>
            )}
            {isSelf && (
              <span className="rounded-full bg-[var(--jt-olive-600)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--jt-stone-50)]">
                {t('أنت', 'You')}
              </span>
            )}
            {!isSelf && isDegreesOk(degrees) && (
              <DegreeChip
                degrees={degrees.degrees}
                label={kinshipLabel(degrees.degrees, degrees.path, locale)}
                onClick={() => onShowDegrees(degrees)}
                ariaLabel={t('عرض صلة القرابة', 'Show relation')}
              />
            )}
            {!isSelf && degrees && 'error' in degrees && degrees.error ? (
              <span className="text-[10px] font-semibold text-[var(--jt-terra-600)]">
                {t('تعذّر حساب الصلة', 'Could not compute relation')}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-end">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em]"
            style={{ color: confColor, backgroundColor: `color-mix(in srgb, ${confColor} 12%, transparent)` }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: confColor }} />
            {confLabel}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold text-[var(--jt-stone-500)]">{pctScore}%</span>
            <ScoreBreakdownPopover breakdown={result.breakdown} t={t} />
          </div>
          {isLocked ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--jt-gold-400)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--jt-olive-900)] transition-colors group-hover:bg-[var(--jt-gold-300)]">
              <Lock className="h-2.5 w-2.5" />
              {t('اطلب الوصول', 'Request access')}
            </span>
          ) : (
            <Arrow className="mt-1 h-4 w-4 text-[var(--jt-stone-400)] transition-colors group-hover:text-[var(--jt-olive-700)]" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyIntro({ t, isAR }: { t: <T extends string>(ar: T, en: T) => T; isAR: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, delay: 0.2 }}
      className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center"
    >
      <SearchIcon className="mx-auto mb-5 h-10 w-10 text-[var(--jt-olive-500)]" />
      <h3 className="text-2xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
        {t('ابدأ بكتابة اسم', 'Start by typing a name')}
      </h3>
      <p
        className="mx-auto mt-3 max-w-md text-[var(--jt-stone-700)]"
        style={{ fontFamily: isAR ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)', lineHeight: isAR ? 1.9 : 1.6 }}
      >
        {t(
          'اكتب «أحمد» أو «Ibraheem» أو «دير ياسين». نتعامل مع اختلافات الصياغة صوتيًا.',
          'Try "Ahmad", "Ibraheem", or "Deir Yassin". We handle spelling variants phonetically.',
        )}
      </p>
    </motion.div>
  );
}

function NoResults({ t }: { t: <T extends string>(ar: T, en: T) => T }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 p-10 text-center"
    >
      <h3 className="text-xl font-bold text-[var(--jt-stone-800)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
        {t('لا نتائج بعد', 'No matches yet')}
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-[var(--jt-stone-600)]">
        {t(
          'جرّب صياغة أخرى، أو أزل بعض المرشحات، أو أضف فردًا من عائلتك لتكون شجرتنا الأم أكمل.',
          'Try a different spelling, remove some filters, or add a family member to enrich the Mother Tree.',
        )}
      </p>
    </motion.div>
  );
}
