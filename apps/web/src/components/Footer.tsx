'use client';

import Link from 'next/link';
import { Github, Mail } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

const Footer = () => {
  const { t, dir } = useLocale();

  return (
    <footer
      dir={dir}
      className="relative overflow-hidden border-t border-[var(--jt-stone-200)]/60 bg-[var(--jt-stone-50)]/60"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--jt-terra-500) 0 8px, var(--jt-gold-500) 8px 16px, var(--jt-olive-400) 16px 24px)',
          opacity: 0.5,
        }}
      />
      <div aria-hidden className="jt-tatreez-dark pointer-events-none absolute inset-0 opacity-[0.03]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21V9" />
                <path d="M12 9c-3-2-5-5-5-7 2 0 5 2 7 4" />
                <path d="M12 9c3-2 5-5 5-7-2 0-5 2-7 4" />
                <path d="M5 17c2 0 4 1 5 3 1-2 3-3 5-3" />
                <path d="M4 13c2-1 4-1 6 1 1-2 3-2 5-1" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold text-[var(--jt-olive-800)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
                جذور
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
                Juthoor
              </span>
            </span>
          </Link>
          <p
            className="mt-5 max-w-sm text-sm text-[var(--jt-stone-600)]"
            style={{ lineHeight: 1.9 }}
          >
            {t(
              'منصّة مفتوحة مجّانية تعيد وصل الفلسطينيين في الشتات عبر شجرة عائلة واحدة ذكية. عربيّة أوّلًا، ثنائية اللغة، بلا إعلانات.',
              'A free, open platform reconnecting Palestinians in the diaspora through one intelligent family tree. Arabic-first, bilingual, ad-free.',
            )}
          </p>
        </div>

        <FooterCol
          title={t('المنصّة', 'Platform')}
          items={[
            { label: t('شجرة العائلة', 'Family Tree'), href: '/tree' },
            { label: t('البحث عن ذويك', 'Family Finder'), href: '/sign-up' },
            { label: t('الشجرة الفلسطينية', 'Palestinian Family Tree'), href: '/pft' },
            { label: t('توثيق الهوية', 'Verify identity'), href: '/verify' },
          ]}
        />

        <FooterCol
          title={t('عن جذور', 'About')}
          items={[
            { label: t('مهمّتنا', 'Our mission'), href: '/about' },
            { label: t('القرى المهجّرة', 'Depopulated villages'), href: '/about' },
            { label: t('كيف يعمل المطابقة', 'How matching works'), href: '/about' },
          ]}
        />

        <FooterCol
          title={t('قانوني', 'Legal')}
          items={[
            { label: t('الخصوصية', 'Privacy'), href: '/privacy' },
            { label: t('الشروط', 'Terms'), href: '/terms' },
            { label: t('أسئلة شائعة', 'FAQ'), href: '/faq' },
            { label: t('تواصل', 'Contact'), href: 'mailto:hello@juthoor.app' },
          ]}
        />
      </div>

      <div className="border-t border-[var(--jt-stone-200)]/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
            {t('جذور — جميع الحقوق للعائلات', 'Juthoor — all rights belong to the families')}
          </p>
          <div className="flex items-center gap-4 text-[var(--jt-stone-500)]">
            <Link href="https://github.com/yossefbouz/juthoor" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="transition-colors hover:text-[var(--jt-olive-700)]">
              <Github className="h-4 w-4" />
            </Link>
            <Link href="mailto:hello@juthoor.app" aria-label="Email" className="transition-colors hover:text-[var(--jt-olive-700)]">
              <Mail className="h-4 w-4" />
            </Link>
            <span className="flex h-3 w-5 overflow-hidden rounded-sm" aria-label="Palestine">
              <span className="h-full w-1/4 bg-[var(--jt-pal-black)]" />
              <span className="h-full w-1/4 bg-[var(--jt-pal-white)] border-y border-[var(--jt-stone-200)]" />
              <span className="h-full w-1/4 bg-[var(--jt-pal-green)]" />
              <span className="h-full w-1/4 bg-[var(--jt-pal-red)]" />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div>
      <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">{title}</h4>
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.label}>
            <Link
              href={i.href}
              className="inline-block text-sm text-[var(--jt-stone-700)] transition-[color,padding] duration-300 hover:ps-1 hover:text-[var(--jt-olive-700)]"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Footer;
