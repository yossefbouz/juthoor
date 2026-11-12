'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronLeft, Image as ImageIcon, MapPin, Users } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { FamilySurnameOverview } from '@/data/user/families-search';
import type { FamilyGalleryItem } from '@/data/user/archives';

function looksArabic(s: string | null): boolean {
  if (!s) return false;
  return /[؀-ۿ]/.test(s);
}

function familiesIndexHref(filters: { district?: string | null; placeId?: string | null }): string {
  const params = new URLSearchParams();
  if (filters.district) params.set('district', filters.district);
  if (filters.placeId) params.set('placeId', filters.placeId);
  const qs = params.toString();
  return qs ? `/families?${qs}` : '/families';
}

export function FamilyClient({
  overview,
  gallery = [],
  filters = {},
}: {
  overview: FamilySurnameOverview;
  gallery?: FamilyGalleryItem[];
  filters?: { district?: string | null; placeId?: string | null };
}) {
  const { t, locale, dir } = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const Back = locale === 'ar' ? ChevronLeft : ArrowLeft;

  const isAr = looksArabic(overview.surname);
  const hasPlaceFilter = Boolean(filters.district || filters.placeId);

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-[var(--jt-olive-200)]/40 bg-gradient-to-b from-[var(--jt-olive-50)] to-transparent">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -end-32 top-0 h-72 w-72 rounded-full bg-[var(--jt-olive-100)] opacity-50 blur-2xl" />
          <div className="absolute -start-20 bottom-0 h-56 w-56 rounded-full bg-[var(--jt-gold-100)] opacity-60 blur-2xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
          <Link
            href={familiesIndexHref(filters)}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
          >
            <Back className="h-3.5 w-3.5" />
            {t('عودة للعائلات', 'Back to families')}
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--card)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
              <Users className="h-3 w-3" />
              {t('عائلة عبر القرى', 'Family across villages')}
            </p>
            <h1
              className="text-5xl font-bold leading-[1.05] text-[var(--jt-olive-900)] md:text-7xl"
              style={{
                fontFamily: isAr ? 'var(--jt-font-display)' : 'var(--jt-font-latin)',
              }}
            >
              {overview.surname}
            </h1>
            <p className="mt-3 max-w-2xl text-[var(--jt-stone-600)] md:text-lg">
              {t(
                hasPlaceFilter
                  ? 'حاملو هذا اللقب ضمن المرشّحات المختارة (قضاء / قرية) — مصنّفون حسب القرية والشجرة.'
                  : 'كل من يحمل هذا اللقب — مصنّفًا حسب القرية والشجرة. عائلات ربما لم تلتقِ من قبل قد تكون ذات جذرٍ واحد.',
                hasPlaceFilter
                  ? 'People with this surname within your district / village filters — grouped by village and tree.'
                  : 'Everyone bearing this surname — grouped by village and tree. Families that never met may share a root.',
              )}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
        {/* Stats */}
        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          <Stat color="olive" value={overview.total_persons} ar="فرد يحمل اللقب" en="People with this surname" />
          <Stat color="gold" value={overview.total_villages} ar="قرية تحضر فيها" en="Villages they appear in" />
          <Stat color="terra" value={overview.total_trees} ar="شجرات" en="Trees" />
        </div>


        {/* Family gallery */}
        {gallery.length > 0 && (
          <section className="mb-10">
            <header className="mb-4">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
                <ImageIcon className="h-3 w-3" />
                {t('معرض العائلة', 'Family gallery')}
              </p>
              <h2
                className="text-2xl font-bold text-[var(--jt-olive-900)]"
                style={{ fontFamily: 'var(--jt-font-display)' }}
              >
                {t('صور مرتبطة بهذا اللقب', 'Pictures linked to this surname')}
              </h2>
            </header>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {gallery.map((pic) => {
                const name =
                  locale === 'ar'
                    ? pic.person_name_ar || pic.person_name_en
                    : pic.person_name_en || pic.person_name_ar;
                return (
                  <li key={pic.id}>
                    <Link
                      href={`/tree/${pic.tree_id}/person/${pic.person_id}`}
                      className="group block overflow-hidden rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] shadow-[var(--jt-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--jt-olive-300)]"
                    >
                      <div className="aspect-square bg-[var(--jt-stone-100)]">
                        {pic.signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pic.signed_url}
                            alt={name ?? ''}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[var(--jt-stone-400)]">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-sm font-semibold text-[var(--jt-olive-900)]">{name}</p>
                        {pic.date_taken && (
                          <p className="text-[11px] text-[var(--jt-stone-500)]">{pic.date_taken}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Per-village groups */}
        {overview.groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center">
            <p
              className="text-2xl font-bold text-[var(--jt-olive-800)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t('لا أحد بهذا اللقب بعد', 'Nobody with this surname yet')}
            </p>
            <p className="mt-2 text-sm text-[var(--jt-stone-600)]">
              {t(
                'كن أول من يضيف فردًا يحمل هذا اللقب.',
                'Be the first to add a person with this surname.',
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {overview.groups.map((g, gi) => (
              <motion.section
                key={g.village_id ?? `unknown-${gi}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: gi * 0.05 }}
                className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
              >
                <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
                      <MapPin className="h-3 w-3" />
                      {g.village_ar
                        ? t('من قرية', 'From village')
                        : t('قرية غير معلومة', 'Village unknown')}
                    </p>
                    {g.village_ar ? (
                      <Link
                        href={`/villages/${g.village_id}`}
                        className="group block"
                      >
                        <h2
                          className={
                            'text-2xl font-bold text-[var(--jt-olive-900)] transition-colors '
                            + 'group-hover:text-[var(--jt-olive-700)] md:text-3xl'
                          }
                          style={{
                            fontFamily: looksArabic(g.village_ar)
                              ? 'var(--jt-font-display)'
                              : 'var(--jt-font-latin)',
                          }}
                        >
                          {locale === 'ar'
                            ? g.village_ar
                            : g.village_en ?? g.village_ar}
                        </h2>
                      </Link>
                    ) : (
                      <h2
                        className="text-2xl font-bold text-[var(--jt-stone-700)] md:text-3xl"
                        style={{ fontFamily: 'var(--jt-font-display)' }}
                      >
                        {t('—', '—')}
                      </h2>
                    )}
                  </div>
                  <span className="rounded-full bg-[var(--jt-olive-100)] px-3 py-1 text-[11px] font-bold text-[var(--jt-olive-800)]">
                    {g.count} {t('فرد', g.count === 1 ? 'person' : 'people')}
                  </span>
                </header>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.sample_persons.map((p) => {
                    const name =
                      locale === 'ar'
                        ? p.name_ar || p.name_en
                        : p.name_en || p.name_ar;
                    const initial = (name ?? '·').slice(0, 1);
                    const isAr = looksArabic(name);
                    return (
                      <li key={p.person_id}>
                        <Link
                          href={`/tree/${p.tree_id}/person/${p.person_id}`}
                          className="group flex items-center gap-3 rounded-2xl border border-transparent bg-[var(--jt-stone-50)]/60 p-3 transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-300)] hover:bg-[var(--card)]"
                        >
                          <span
                            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--jt-olive-100)] font-bold text-[var(--jt-olive-800)]"
                            style={{ fontFamily: 'var(--jt-font-display)' }}
                          >
                            {initial}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate font-semibold text-[var(--jt-stone-900)]"
                              style={{
                                fontFamily: isAr
                                  ? 'var(--jt-font-arabic)'
                                  : 'var(--jt-font-latin)',
                              }}
                            >
                              {name}
                            </p>
                            <p className="truncate text-[11px] text-[var(--jt-stone-500)]">
                              {p.birth_year ? `${p.birth_year} · ` : ''}
                              {p.tree_name ?? t('شجرة', 'Tree')}
                            </p>
                          </div>
                          <Arrow className="h-3.5 w-3.5 flex-none text-[var(--jt-stone-400)] transition-colors group-hover:text-[var(--jt-olive-600)]" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {g.count > g.sample_persons.length && (
                  <Link
                    href={`/search?surname=${encodeURIComponent(overview.surname)}&placeId=${g.village_id}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
                  >
                    {t(`عرض كل ${g.count} في البحث`, `View all ${g.count} in search`)}
                    <Arrow className="h-3 w-3" />
                  </Link>
                )}
              </motion.section>
            ))}
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
}: {
  color: 'olive' | 'gold' | 'terra';
  value: number;
  ar: string;
  en: string;
}) {
  const fg =
    color === 'olive'
      ? 'var(--jt-olive-700)'
      : color === 'gold'
        ? 'var(--jt-gold-600)'
        : 'var(--jt-terra-600)';
  return (
    <div className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]">
      <p
        className="text-4xl font-bold leading-none"
        style={{ fontFamily: 'var(--jt-font-display)', color: fg }}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
        <span className="hidden md:inline">{en}</span>
        <span className="md:hidden">{ar}</span>
      </p>
    </div>
  );
}
