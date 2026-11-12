'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useLocale } from '@/contexts/LocaleContext';

const LINKS: Array<{
  href: string;
  ar: string;
  en: string;
  adminOnly?: boolean;
}> = [
  { href: '/admin/verifications', ar: 'التوثيق', en: 'Verifications' },
  { href: '/admin/appeals', ar: 'الاستئنافات', en: 'Appeals' },
  { href: '/admin/review', ar: 'المطابقات', en: 'Matches', adminOnly: true },
  { href: '/admin/card-check', ar: 'البطاقات', en: 'Card check', adminOnly: true },
  { href: '/admin/moderators', ar: 'المشرفون', en: 'Moderators', adminOnly: true },
  { href: '/admin/email-outbox', ar: 'البريد', en: 'Email outbox', adminOnly: true },
];

/**
 * Shared staff sub-nav for /admin/* pages. Moderators see verification +
 * appeals; admins also see match review, moderator appointments, and outbox.
 */
export function AdminStaffNav({ isAdmin = false }: { readonly isAdmin?: boolean }) {
  const { t, dir } = useLocale();
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <nav
      dir={dir}
      aria-label={t('قائمة الفريق', 'Staff navigation')}
      className="mb-4 flex flex-wrap gap-2 border-b border-[var(--jt-stone-200)] pb-3"
    >
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ' +
              (active
                ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                : 'border border-[var(--jt-stone-200)] text-[var(--jt-stone-700)] hover:bg-[var(--jt-olive-50)]')
            }
          >
            {t(l.ar, l.en)}
          </Link>
        );
      })}
    </nav>
  );
}
