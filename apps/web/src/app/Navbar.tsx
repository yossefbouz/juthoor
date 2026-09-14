'use client';

import Link from 'next/link';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { LocaleToggle } from '@/components/LocaleToggle';
import { CardNav, type CardNavItem } from '@/components/reactbits/CardNav';
import { NAV_ITEMS } from '@/app/nav-items';
import { useLocale } from '@/contexts/LocaleContext';

/**
 * Site navigation as a floating React Bits "card nav": a 60px bar with the
 * wordmark centred, a hamburger at the start and locale / theme / Log In at
 * the end. Opening it drops three cards — Explore, Archive, About — that
 * carry the FRS Appendix 2 module links (see nav-items.ts) plus the public
 * pages. Black-on-paper to match the keffiyeh homepage.
 */
export default function Navbar() {
  const { t } = useLocale();
  const modules = NAV_ITEMS.filter((i) => i.href !== '/');
  const explore = modules.filter((i) => i.available);
  const archive = modules.filter((i) => !i.available);

  const items: CardNavItem[] = [
    {
      label: t('استكشف', 'Explore'),
      bgColor: '#0a0a0a',
      textColor: '#F8F4EE',
      links: explore.map((i) => ({ label: t(i.ar, i.en), href: i.href })),
    },
    {
      label: t('الأرشيف', 'Archive'),
      bgColor: '#EDE9E2',
      textColor: '#0a0a0a',
      links: archive.map((i) => ({ label: t(i.ar, i.en), href: i.href, disabled: true, badge: t('قريبًا', 'Soon') })),
    },
    {
      label: t('عن جذور', 'About'),
      bgColor: '#B88A14',
      textColor: '#0a0a0a',
      links: [
        { label: t('هويتنا', 'Who We Are'), href: '/about' },
        { label: t('أهدافنا', 'Why Are We Doing This'), href: '/why' },
        { label: t('كيف نحقق أهدافنا', 'How Does This Work'), href: '/how' },
        { label: t('تواصل معنا', 'Contact Us'), href: '/contact' },
      ],
    },
  ];

  return (
    <CardNav
      items={items}
      baseColor="#F8F4EE"
      openLabel={t('افتح القائمة', 'Open menu')}
      closeLabel={t('أغلق القائمة', 'Close menu')}
      logo={
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden
            className="relative inline-flex h-8 w-8 items-center justify-center bg-[#0a0a0a] text-[#F8F4EE] transition-transform group-hover:-rotate-3"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21V9" />
              <path d="M12 9c-3-2-5-5-5-7 2 0 5 2 7 4" />
              <path d="M12 9c3-2 5-5 5-7-2 0-5 2-7 4" />
              <path d="M5 17c2 0 4 1 5 3 1-2 3-3 5-3" />
              <path d="M4 13c2-1 4-1 6 1 1-2 3-2 5-1" />
            </svg>
          </span>
          <span className="flex items-center gap-2.5 leading-none">
            <span className="text-[1.35rem] font-bold text-[#0a0a0a]" style={{ fontFamily: 'var(--jt-font-display)' }}>
              جذور
            </span>
            <span aria-hidden className="h-3.5 w-px bg-black/20" />
            <span className="pt-px text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]" style={{ fontFamily: 'var(--jt-font-display-latin)' }}>
              Juthoor
            </span>
          </span>
        </Link>
      }
      actions={
        <>
          <LocaleToggle />
          <ModeToggle />
          <Link
            href="/login"
            className="jt-btn-shine hidden h-10 shrink-0 items-center bg-[var(--jt-gold-500)] px-4 text-sm font-semibold text-[#0a0a0a] transition-colors hover:bg-[var(--jt-gold-400)] sm:inline-flex"
          >
            {t('تسجيل الدخول', 'Log In / Register')}
          </Link>
        </>
      }
    />
  );
}
