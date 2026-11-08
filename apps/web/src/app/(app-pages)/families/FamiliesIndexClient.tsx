'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Search, Users, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { FamilyIndexRow } from '@/data/user/families-index';
import { DistrictSelect, type DistrictOption } from '@/components/search/DistrictSelect';
import { useRouter } from 'next/navigation';

export function FamiliesIndexClient({
  rows,
  districts = [],
  initialDistrict = null,
}: {
  rows: FamilyIndexRow[];
  districts?: DistrictOption[];
  initialDistrict?: string | null;
}) {
  const { t, locale, dir } = useLocale();
  const router = useRouter();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState<string | null>(initialDistrict);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.surname.toLowerCase().includes(q));
  }, [rows, query]);

  const totalPersons = rows.reduce((sum, r) => sum + r.count, 0);

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

        {/* Search */}
        <div className="relative mb-8">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--jt-stone-500)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              'ابحث: العجرمي، الخوري، Khoury...',
              'Search: Al-Ajrami, Khoury, Bouz…',
            )}
            className="w-full rounded-2xl border border-[var(--jt-olive-200)]/60 bg-[var(--card)] py-3.5 ps-12 pe-12 text-base text-[var(--jt-stone-900)] placeholder:text-[var(--jt-stone-400)] shadow-[var(--jt-shadow-sm)] focus:border-[var(--jt-olive-500)] focus:outline-none focus:ring-2 focus:ring-[var(--jt-olive-300)]/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--jt-stone-500)] hover:bg-[var(--jt-stone-100)]"
              aria-label={t('مسح', 'Clear')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mb-6 max-w-sm">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
            {t('اللواء / القضاء', 'District')}
          </label>
          <DistrictSelect
            districts={districts}
            value={district}
            onChange={(key) => {
              setDistrict(key);
              const params = new URLSearchParams();
              if (key) params.set('district', key);
              router.push(params.toString() ? `/families?${params}` : '/families');
            }}
            locale={locale}
          />
        </div>

        {/* Direct entry — let user jump to a surname not yet in the top list */}
        {query && filtered.length === 0 && (
          <div className="mb-6 rounded-2xl border border-[var(--jt-gold-400)]/40 bg-[var(--jt-gold-100)]/40 p-4 text-sm">
            <p className="text-[var(--jt-stone-800)]">
              {t(
                'لم نجد هذا اللقب بين الأكثر شيوعًا. تستطيع الذهاب مباشرةً إلى صفحته:',
                'Not in the top list — but you can jump straight to its page:',
              )}
            </p>
            <Link
              href={`/families/${encodeURIComponent(query.trim())}`}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-xs font-bold text-[var(--jt-stone-50)] hover:bg-[var(--jt-olive-800)]"
            >
              {t(`اذهب إلى "${query.trim()}"`, `Go to "${query.trim()}"`)}
              <Arrow className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 && !query ? (
          <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center text-sm text-[var(--jt-stone-700)]">
            {t(
              'لم تُسجَّل أي عائلة بعد. ابدأ بإضافة شخص لشجرتك.',
              'No families recorded yet. Add someone to your tree to get started.',
            )}
          </div>
        ) : (
          <p className="mb-4 text-xs text-[var(--jt-stone-500)]">
            {t(
              `يعرض ${filtered.length} من ${rows.length} لقبًا`,
              `Showing ${filtered.length} of ${rows.length}`,
            )}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row, i) => (
            <motion.div
              key={row.surname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.015, 0.5) }}
            >
              <Link
                href={`/families/${encodeURIComponent(row.surname)}`}
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
