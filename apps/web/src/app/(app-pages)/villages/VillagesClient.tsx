'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MapPin, Search, Tent, Users, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { CountUp } from '@/components/home/CountUp';
import type { PlaceListItem, PlaceTypeCounts } from '@/data/user/places';

const TYPE_FILTERS = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'village', ar: 'قرى', en: 'Villages' },
  { key: 'city', ar: 'مدن', en: 'Cities' },
  { key: 'clan_locality', ar: 'عشائر', en: 'Clans (3achira)' },
  { key: 'khirba', ar: 'خرب', en: 'Ruins' },
] as const;

type FilterKey = (typeof TYPE_FILTERS)[number]['key'];

const PAGE_SIZE = 60;

function looksArabic(s: string | null): boolean {
  if (!s) return false;
  return /[؀-ۿ]/.test(s);
}

export function VillagesClient({
  places,
  counts,
}: {
  places: PlaceListItem[];
  counts: PlaceTypeCounts;
}) {
  const { t, locale, dir } = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (filter !== 'all' && p.place_type !== filter) return false;
      if (!q) return true;
      const hay = [p.name_ar, p.name_en, p.district_ar, p.district_en]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [places, filter, query]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > visible.length;

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--jt-olive-100)_0%,_transparent_65%)] opacity-60" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <MapPin className="h-3 w-3" />
            {t('قرى ومدن وعشائر فلسطين', 'Villages, cities & clans of Palestine')}
          </p>
          <h1
            className="text-4xl font-bold leading-[1.1] text-[var(--jt-olive-900)] md:text-6xl"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('قرى ومدن نحفظ أسماءها', 'Places we refuse to forget')}
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--jt-stone-600)] md:text-lg">
            {t(
              `${counts.total} مكانًا فلسطينيًا مع أسمائها ومناطقها. لكل اسمٍ نحفظه — انتصار صغير على النسيان.`,
              `${counts.total} Palestinian places — every name we save is a small victory over forgetting.`,
            )}
          </p>
        </motion.header>

        {/* Stat strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat color="olive" value={counts.village} ar="قرية" en="Villages" index={0} />
          <Stat color="gold" value={counts.city} ar="مدينة" en="Cities" index={1} />
          <Stat color="terra" value={counts.clan_locality} ar="عشيرة" en="Clans · 3achira" index={2} />
          <Stat color="stone" value={counts.khirba} ar="خربة" en="Ruins" index={3} />
        </div>

        {/* Search + filter row */}
        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--jt-stone-500)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t(
                'ابحث: ترشيحا، Tarshiha، صفد، Tarabin...',
                'Search: Tarshiha, Safad, Yafa, Tarabin…',
              )}
              className="w-full rounded-2xl border border-[var(--jt-olive-200)]/60 bg-[var(--card)] py-3.5 ps-12 pe-12 text-base text-[var(--jt-stone-900)] placeholder:text-[var(--jt-stone-400)] shadow-[var(--jt-shadow-sm)] transition-[border-color,box-shadow] duration-300 focus:border-[var(--jt-olive-500)] focus:shadow-[var(--jt-shadow-md)] focus:outline-none focus:ring-2 focus:ring-[var(--jt-olive-300)]/40"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}
                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--jt-stone-500)] hover:bg-[var(--jt-stone-100)]"
                aria-label={t('مسح', 'Clear')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label={t('نوع المكان', 'Place type')}
            className="flex flex-wrap gap-1 rounded-full border border-[var(--jt-olive-200)]/60 bg-[var(--card)] p-1 shadow-[var(--jt-shadow-sm)]"
          >
            {TYPE_FILTERS.map((f) => {
              const isActive = filter === f.key;
              return (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    startTransition(() => {
                      setFilter(f.key);
                      setPage(1);
                    });
                  }}
                  className={
                    'rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 active:scale-95 '
                    + (isActive
                      ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)]'
                      : 'text-[var(--jt-stone-600)] hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)]')
                  }
                >
                  {t(f.ar, f.en)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Result-count summary */}
        <p className="mb-4 text-xs text-[var(--jt-stone-500)]">
          {t(
            `يعرض ${visible.length} من أصل ${filtered.length} مكانًا`,
            `Showing ${visible.length} of ${filtered.length}`,
          )}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center">
            <p
              className="text-2xl font-bold text-[var(--jt-olive-800)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t('لا نتائج', 'No results')}
            </p>
            <p className="mt-2 text-sm text-[var(--jt-stone-600)]">
              {t(
                'جرّب لقبًا آخر أو غيّر النوع.',
                'Try a different name or another type.',
              )}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p, i) => (
              <PlaceCard key={p.id} place={p} index={i} Arrow={Arrow} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-[var(--jt-olive-300)]/70 bg-[var(--card)] px-6 py-2.5 text-sm font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-50)]"
            >
              {t('عرض المزيد', 'Show more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  color,
  value,
  ar,
  en,
  index,
}: {
  color: 'olive' | 'gold' | 'terra' | 'stone';
  value: number;
  ar: string;
  en: string;
  index: number;
}) {
  const { t } = useLocale();
  const reduce = useReducedMotion();
  const fg =
    color === 'olive'
      ? 'var(--jt-olive-700)'
      : color === 'gold'
        ? 'var(--jt-gold-600)'
        : color === 'terra'
          ? 'var(--jt-terra-600)'
          : 'var(--jt-stone-700)';
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.1 + index * 0.07 }}
      className="group relative overflow-hidden rounded-2xl border border-[var(--jt-stone-200)]/70 bg-[var(--card)] p-4 shadow-[var(--jt-shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--jt-shadow-md)]"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 origin-center scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
        style={{ backgroundColor: fg, opacity: 0.6 }}
      />
      <p
        className="text-3xl font-bold leading-none"
        style={{ fontFamily: 'var(--jt-font-display)', color: fg }}
      >
        <CountUp value={value} duration={1.2} />
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
        {t(ar, en)}
      </p>
    </motion.div>
  );
}

function PlaceCard({
  place,
  index,
  Arrow,
}: {
  place: PlaceListItem;
  index: number;
  Arrow: React.ComponentType<{ className?: string }>;
}) {
  const { t, locale } = useLocale();
  const isArabic = looksArabic(place.name_ar);
  const showName = locale === 'ar' && isArabic ? place.name_ar : place.name_en ?? place.name_ar;
  const sub = locale === 'ar' && isArabic ? place.name_en : isArabic ? place.name_ar : null;

  const TypeIcon =
    place.place_type === 'clan_locality' ? Tent : place.place_type === 'city' ? Users : MapPin;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.015, 0.6) }}
    >
      <Link
        href={`/villages/${place.id}`}
        className="group block h-full rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)] hover:shadow-[var(--jt-shadow-md)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-[var(--jt-olive-600)]">
              <TypeIcon className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                {place.place_type === 'clan_locality'
                  ? t('عشيرة', 'Clan')
                  : place.place_type === 'city'
                    ? t('مدينة', 'City')
                    : place.place_type === 'khirba'
                      ? t('خربة', 'Ruin')
                      : t('قرية', 'Village')}
              </span>
            </div>
            <p
              className="truncate text-xl font-bold text-[var(--jt-olive-900)] group-hover:text-[var(--jt-olive-700)]"
              style={{
                fontFamily: isArabic
                  ? 'var(--jt-font-display)'
                  : 'var(--jt-font-latin)',
              }}
            >
              {showName}
            </p>
            {sub && (
              <p className="mt-0.5 truncate text-xs text-[var(--jt-stone-500)]">{sub}</p>
            )}
            {place.district_ar && (
              <p className="mt-2 text-[11px] text-[var(--jt-stone-500)]">
                {locale === 'ar' ? place.district_ar : place.district_en ?? place.district_ar}
              </p>
            )}
          </div>
          <Arrow className="mt-1 h-4 w-4 flex-none text-[var(--jt-stone-400)] transition-all duration-300 group-hover:text-[var(--jt-olive-600)] ltr:group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
        </div>
        {place.depopulated_year && (
          <span className="mt-3 inline-flex items-center rounded-full bg-[var(--jt-terra-50)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-terra-600)]">
            {place.depopulated_year}
          </span>
        )}
      </Link>
    </motion.div>
  );
}
