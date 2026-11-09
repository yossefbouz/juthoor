'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, MapPin, Search, Users, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { FamilyIndexRow } from '@/data/user/families-index';
import type { PlaceListItem } from '@/data/user/places';
import {
  DistrictSelect,
  placeMatchesDistrict,
  type DistrictOption,
} from '@/components/search/DistrictSelect';
import { VillageCombobox } from '@/components/search/VillageCombobox';
import { useRouter } from 'next/navigation';

function buildFamiliesHref(opts: {
  q?: string | null;
  district?: string | null;
  placeId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.district) params.set('district', opts.district);
  if (opts.placeId) params.set('placeId', opts.placeId);
  const qs = params.toString();
  return qs ? `/families?${qs}` : '/families';
}

function familyDetailHref(
  surname: string,
  filters: { district?: string | null; placeId?: string | null },
): string {
  const params = new URLSearchParams();
  if (filters.district) params.set('district', filters.district);
  if (filters.placeId) params.set('placeId', filters.placeId);
  const base = `/families/${encodeURIComponent(surname)}`;
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function FamiliesIndexClient({
  rows,
  places = [],
  districts = [],
  initialQ = null,
  initialDistrict = null,
  initialPlaceId = null,
}: {
  rows: FamilyIndexRow[];
  places?: PlaceListItem[];
  districts?: DistrictOption[];
  initialQ?: string | null;
  initialDistrict?: string | null;
  initialPlaceId?: string | null;
}) {
  const { t, locale, dir } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const [query, setQuery] = useState(initialQ ?? '');
  const [district, setDistrict] = useState<string | null>(initialDistrict);
  const [placeId, setPlaceId] = useState<string | null>(initialPlaceId);

  const villagesInDistrict = useMemo(
    () => places.filter((p) => placeMatchesDistrict(p, district)),
    [places, district],
  );

  function navigate(next: {
    q?: string | null;
    district?: string | null;
    placeId?: string | null;
  }) {
    const href = buildFamiliesHref({
      q: next.q !== undefined ? next.q : query,
      district: next.district !== undefined ? next.district : district,
      placeId: next.placeId !== undefined ? next.placeId : placeId,
    });
    startTransition(() => {
      router.push(href);
    });
  }

  function onSurnameSubmit(e: FormEvent) {
    e.preventDefault();
    navigate({ q: query });
  }

  const totalPersons = rows.reduce((sum, r) => sum + r.count, 0);
  const hasActiveFilters = Boolean(query.trim() || district || placeId);

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--jt-olive-100)_0%,_transparent_65%)] opacity-60" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <Users className="h-3 w-3" />
            {t('عائلات الشجرة الأم', 'Families of the Master Tree')}
          </p>
          <h1
            className="text-4xl font-bold leading-[1.1] text-[var(--jt-olive-900)] md:text-6xl"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('عائلات بحسب اللقب', 'Families by surname')}
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--jt-stone-600)] md:text-lg">
            {t(
              `${rows.length} لقبٍ يجمع ${totalPersons.toLocaleString()} فردًا — اضغط لقبًا لرؤية كل العائلات التي تحمله، عبر كل القرى.`,
              `${rows.length} surnames spanning ${totalPersons.toLocaleString()} people — pick a surname to see every family that carries it, across every village.`,
            )}
          </p>
        </motion.header>

        <form onSubmit={onSurnameSubmit} className="relative mb-6">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--jt-stone-500)]" />
          <input
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              'ابحث: العجرمي، الخوري، Khoury...',
              'Search: Al-Ajrami, Khoury, Bouz…',
            )}
            className="w-full rounded-2xl border border-[var(--jt-olive-200)]/60 bg-[var(--card)] py-3.5 ps-12 pe-28 text-base text-[var(--jt-stone-900)] placeholder:text-[var(--jt-stone-400)] shadow-[var(--jt-shadow-sm)] focus:border-[var(--jt-olive-500)] focus:outline-none focus:ring-2 focus:ring-[var(--jt-olive-300)]/40"
            aria-label={t('اللقب', 'Surname')}
          />
          <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  navigate({ q: '' });
                }}
                className="rounded-full p-1 text-[var(--jt-stone-500)] hover:bg-[var(--jt-stone-100)]"
                aria-label={t('مسح', 'Clear')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-[var(--jt-olive-700)] px-3 py-1.5 text-xs font-bold text-[var(--jt-stone-50)] hover:bg-[var(--jt-olive-800)] disabled:opacity-60"
            >
              {t('بحث', 'Search')}
            </button>
          </div>
        </form>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              <MapPin className="h-3 w-3" />
              {t('اللواء / القضاء', 'District')}
            </label>
            <DistrictSelect
              districts={districts}
              value={district}
              onChange={(key) => {
                const clearedPlace =
                  key &&
                  placeId &&
                  !places.filter((p) => placeMatchesDistrict(p, key)).some((v) => v.id === placeId)
                    ? null
                    : placeId;
                setDistrict(key);
                setPlaceId(clearedPlace);
                navigate({ district: key, placeId: clearedPlace });
              }}
              locale={locale}
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              <MapPin className="h-3 w-3" />
              {t('القرية / المكان (VCC)', 'Village / place (VCC)')}
            </label>
            <VillageCombobox
              villages={villagesInDistrict}
              value={placeId}
              onChange={(id) => {
                setPlaceId(id);
                navigate({ placeId: id });
              }}
              locale={locale}
              placeholder={t('ابحث عن قرية...', 'Search a village…')}
            />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setDistrict(null);
                setPlaceId(null);
                startTransition(() => router.push('/families'));
              }}
              className="text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
            >
              {t('مسح كل المرشّحات', 'Clear all filters')}
            </button>
          </div>
        )}

        {query.trim() && rows.length === 0 && (
          <div className="mb-6 rounded-2xl border border-[var(--jt-gold-400)]/40 bg-[var(--jt-gold-100)]/40 p-4 text-sm">
            <p className="text-[var(--jt-stone-800)]">
              {t(
                'لم نجد هذا اللقب بهذه المرشّحات. تستطيع الذهاب مباشرةً إلى صفحته:',
                'No matches with these filters — you can still open the surname page:',
              )}
            </p>
            <Link
              href={familyDetailHref(query.trim(), { district, placeId })}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-xs font-bold text-[var(--jt-stone-50)] hover:bg-[var(--jt-olive-800)]"
            >
              {t(`اذهب إلى "${query.trim()}"`, `Go to "${query.trim()}"`)}
              <Arrow className="h-3 w-3" />
            </Link>
          </div>
        )}

        {rows.length === 0 && !query.trim() ? (
          <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center text-sm text-[var(--jt-stone-700)]">
            {t(
              hasActiveFilters
                ? 'لا عائلات تطابق هذه المرشّحات.'
                : 'لم تُسجَّل أي عائلة بعد. ابدأ بإضافة شخص لشجرتك.',
              hasActiveFilters
                ? 'No families match these filters.'
                : 'No families recorded yet. Add someone to your tree to get started.',
            )}
          </div>
        ) : (
          <p className="mb-4 text-xs text-[var(--jt-stone-500)]">
            {t(`يعرض ${rows.length} لقبًا`, `Showing ${rows.length} surnames`)}
            {isPending ? t(' · جارٍ التحديث…', ' · Updating…') : ''}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, i) => (
            <motion.div
              key={row.surname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.015, 0.5) }}
            >
              <Link
                href={familyDetailHref(row.surname, { district, placeId })}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)] hover:shadow-[var(--jt-shadow-md)]"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-2xl font-bold text-[var(--jt-olive-900)] group-hover:text-[var(--jt-olive-700)]"
                    style={{
                      fontFamily: row.is_arabic
                        ? 'var(--jt-font-display)'
                        : 'var(--jt-font-latin)',
                    }}
                  >
                    {row.surname}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--jt-stone-500)]">
                    {t(`${row.count} فرد`, `${row.count} ${row.count === 1 ? 'person' : 'people'}`)}
                  </p>
                </div>
                <Arrow className="h-4 w-4 flex-none text-[var(--jt-stone-400)] transition-colors group-hover:text-[var(--jt-olive-600)]" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
