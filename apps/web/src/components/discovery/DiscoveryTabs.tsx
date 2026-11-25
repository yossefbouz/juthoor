'use client';

/**
 * DiscoveryTabs — the horizontal "5 dimensions of search" strip.
 *
 *   Find Individual  |  Find Family  |  Find Village/City/Clan  |  Pictures  |  Documents
 *
 * Lives at the top of the dashboard. Each tab routes to its specific
 * search surface. Pictures + Documents currently link to /search with a
 * dimension param so they look real today; they upgrade to dedicated
 * lanes as content grows.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { FileText, Image as ImageIcon, Link2, MapPin, User, Users } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

type Dimension = {
  key: 'individual' | 'family' | 'place' | 'pictures' | 'documents' | 'connections';
  href: string;
  matchPrefix: string[];
  icon: React.ComponentType<{ className?: string }>;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
};

const DIMENSIONS: Dimension[] = [
  {
    key: 'individual',
    href: '/search',
    matchPrefix: ['/search'],
    icon: User,
    ar: 'فرد',
    en: 'Individual',
    hintAr: 'ابحث باسم شخص',
    hintEn: 'By name',
  },
  {
    key: 'family',
    href: '/families',
    matchPrefix: ['/families'],
    icon: Users,
    ar: 'عائلة',
    en: 'Family',
    hintAr: 'بحسب اللقب عبر القرى',
    hintEn: 'By surname across villages',
  },
  {
    key: 'place',
    href: '/villages',
    matchPrefix: ['/villages'],
    icon: MapPin,
    ar: 'قرية / مدينة / عشيرة',
    en: 'Village · City · Clan',
    hintAr: '617 قرية ومدينة',
    hintEn: '617 places, all of Palestine',
  },
  {
    key: 'pictures',
    href: '/search?dim=pictures',
    matchPrefix: [],
    icon: ImageIcon,
    ar: 'صور',
    en: 'Pictures',
    hintAr: 'صور العائلات والقرى',
    hintEn: 'Picture Archive',
  },
  {
    key: 'documents',
    href: '/search?dim=documents',
    matchPrefix: [],
    icon: FileText,
    ar: 'وثائق',
    en: 'Documents',
    hintAr: 'وثائق عثمانية وأونروا',
    hintEn: 'Deeds, UNRWA, Mandate',
  },
  {
    key: 'connections',
    href: '/dashboard/connections',
    matchPrefix: ['/dashboard/connections'],
    icon: Link2,
    ar: 'روابط',
    en: 'Connections',
    hintAr: 'روابط محتملة مع أشجار أخرى',
    hintEn: 'Possible links to other trees',
  },
];

export function DiscoveryTabs() {
  const { t, locale } = useLocale();
  const pathname = usePathname();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
          {t('ابحث واكتشف الروابط', 'Discovery & connections')}
        </p>
        <span className="hidden text-[11px] text-[var(--jt-stone-500)] md:inline">
          {t(
            'اختر بُعدًا للبحث في الشجرة الأم',
            'Pick a dimension to query the Master Tree',
          )}
        </span>
      </div>

      <div
        role="tablist"
        aria-label={t('أبعاد البحث', 'Search dimensions')}
        className="grid gap-2 rounded-3xl border border-[var(--jt-olive-200)]/60 bg-[var(--card)] p-2 shadow-[var(--jt-shadow-sm)] sm:grid-cols-2 lg:grid-cols-6"
      >
        {DIMENSIONS.map((d, i) => {
          const isActive = d.matchPrefix.some((p) => pathname.startsWith(p));
          const Icon = d.icon;
          return (
            <Link
              key={d.key}
              role="tab"
              aria-selected={isActive}
              href={d.href}
              className={
                'group relative flex flex-col gap-1.5 rounded-2xl px-4 py-3 text-start transition-all '
                + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)] '
                + (isActive
                  ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)]'
                  : 'text-[var(--jt-stone-800)] hover:bg-[var(--jt-olive-50)]/70')
              }
              style={{
                animationDelay: `${i * 40}ms`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    'inline-flex h-7 w-7 items-center justify-center rounded-xl transition-colors '
                    + (isActive
                      ? 'bg-[var(--jt-gold-400)] text-[var(--jt-olive-900)]'
                      : 'bg-[var(--jt-olive-100)] text-[var(--jt-olive-700)] group-hover:bg-[var(--jt-olive-200)]')
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span
                  className="text-[15px] font-bold leading-tight"
                  style={{
                    fontFamily:
                      locale === 'ar' ? 'var(--jt-font-display)' : 'var(--jt-font-latin)',
                  }}
                >
                  {t(d.ar, d.en)}
                </span>
              </div>
              <span
                className={
                  'text-[11px] leading-snug '
                  + (isActive ? 'text-[var(--jt-olive-100)]' : 'text-[var(--jt-stone-500)]')
                }
              >
                {t(d.hintAr, d.hintEn)}
              </span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--jt-gold-400)]"
                />
              )}
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
