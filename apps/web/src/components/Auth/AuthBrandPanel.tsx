'use client';

import Image from 'next/image';
import { useLocale } from '@/contexts/LocaleContext';
import { INK, headingFont } from '@/components/home/homeContent';

/**
 * Brand side of the auth pages: the same wordmark, tagline and key-of-return
 * medallion as the homepage hero, so log-in reads as part of the same site.
 * Hidden below `lg`, where the navbar already carries the brand.
 */
export function AuthBrandPanel() {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
  // Letter-spacing pulls joined Arabic letters apart, so only Latin text is tracked.
  const eyebrow = isAR ? 'text-[13px]' : 'text-[11px] uppercase tracking-[0.24em]';

  return (
    <div className="hidden flex-col lg:flex">
      <p className={`${eyebrow} font-medium text-[var(--jt-stone-800)]`}>
        {t('من الفلسطينيين، عن الفلسطينيين، للفلسطينيين', 'By Palestinians, For Palestinians')}
      </p>

      <div className="mt-8 flex items-center gap-8">
        <div>
          <p
            aria-hidden
            className="select-none text-[clamp(3rem,6vw,5rem)] font-medium leading-[1.05]"
            style={{ fontFamily: isAR ? 'var(--jt-font-kufi)' : 'var(--jt-font-display-latin)', color: INK }}
          >
            {isAR ? 'جذور' : 'Juthoor'}
          </p>
          <p
            className="mt-0.5 text-[12px] tracking-[0.02em] text-[var(--jt-stone-500)]"
            style={{ fontFamily: isAR ? 'var(--jt-font-sans-latin)' : 'var(--jt-font-kufi)' }}
          >
            {isAR ? 'Juthoor' : 'جذور'}
          </p>
        </div>

        <figure className="relative h-28 w-28 shrink-0">
          <svg aria-hidden viewBox="0 0 100 100" className="jt-spin-slow absolute inset-0 h-full w-full text-black/65">
            <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.2 3.2" />
            <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.4" strokeOpacity="0.8" />
          </svg>
          <div className="absolute inset-[13%] overflow-hidden rounded-full border border-black/15 bg-[var(--jt-stone-100)]">
            <Image
              src="/images/hero-key.jpg"
              alt={t(
                'يد جدّ ويد طفل تمسكان مفتاحًا حديديًا قديمًا — مفتاح العودة',
                "An elder's hand and a child's hand holding an old iron key — the key of return",
              )}
              fill
              sizes="112px"
              className="object-cover grayscale contrast-125 brightness-90"
              style={{ objectPosition: '50% 40%' }}
            />
          </div>
        </figure>
      </div>

      <p
        className="mt-8 max-w-md text-[clamp(1.15rem,1.8vw,1.45rem)] font-medium leading-[1.55]"
        style={{ fontFamily: headingFont(isAR) }}
      >
        {t('شجرة عائلة واحدة لـجميع الفلسطينيين في كل مكان.', 'One family tree for all Palestinians, everywhere.')}
      </p>
      <p className="mt-4 max-w-md text-[15px] leading-[1.85] text-[var(--jt-stone-600)]">
        {t(
          'قم ببناء شجرة عائلتك، تواصل مع أقاربك، واكتشف مدى ترابط عائلتك مع بقية الشعب الفلسطيني.',
          'Build your tree, find your relatives, and reconnect your family to the wider Palestinian Family Tree.',
        )}
      </p>

      <p className={`${eyebrow} mt-10 max-w-md border-t border-black/15 pt-5 text-[var(--jt-stone-500)]`}>
        {t('غير ربحيّة · مجّانية للأبد · بدون إعلانات', 'Non-profit · Free forever · No ads')}
      </p>
    </div>
  );
}
