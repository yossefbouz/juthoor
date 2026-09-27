'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useLocale } from '@/contexts/LocaleContext';
import { DiasporaConstellation } from '@/components/home/DiasporaConstellation';
import { ScrollWords } from '@/components/about/ScrollWords';
import { KeffiyehBand } from '@/components/home/KeffiyehPattern';
import { SectionLabel } from '@/components/home/SectionLabel';
import { CONTAINER, EASE_OUT, GRID, headingFont, type Village } from '@/components/home/homeContent';

/**
 * Map card slides in from the leading edge, copy from the trailing edge —
 * the two halves close on each other as the section enters view.
 */
export function DiasporaSection({ villages }: { villages: Village[] }) {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
  const reduce = useReducedMotion();
  const lead = isAR ? 64 : -64;

  return (
    <section className={`${CONTAINER} pb-24 md:pb-32`}>
      <div className={`${GRID} items-center gap-y-10`}>
        <motion.div
          className="col-span-12 lg:col-span-7"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: lead }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        >
          <div className="relative overflow-hidden border border-[var(--jt-stone-900)]/15 bg-white">
            <div className="relative h-64 md:h-80">
              <DiasporaConstellation className="h-full w-full" />
            </div>
            <KeffiyehBand className="border-t border-[var(--jt-stone-900)]/15 text-black/85" height={30} />
          </div>
        </motion.div>

        <motion.div
          className="col-span-12 lg:col-span-5 lg:ps-6"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -lead }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
        >
          <SectionLabel index="01" text={t('الشتات', 'Diaspora')} />
          <h2
            className="mt-6 text-[clamp(1.4rem,2.4vw,1.95rem)] font-medium leading-[1.4] text-[var(--jt-stone-900)]"
            style={{ fontFamily: headingFont(isAR), fontWeight: 500 }}
          >
            {t('من حيفا إلى سانتياغو.', 'From Haifa to Santiago.')}
          </h2>
          <ScrollWords
            className="mt-4 text-[16px] leading-[1.85] text-[var(--jt-stone-600)]"
            text={t(
              'كل نقطة على هذه الخريطة ترمز الى احدى عائلات فلسطين التي تناثرت في الشتات. يمكنك ان تتصور مدى معاناة الشعب الفلسطيني منذ النكبة وحتى يومنا هذا',
              'Every dot is a documented family. Families from one village scatter across dozens of countries — here that scatter becomes visible in one place for the first time.',
            )}
          />
          <p className="mt-7 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
            {t('قرى نحفظها:', 'Villages we remember:')}
          </p>
          <motion.ul
            className="mt-2 flex flex-wrap gap-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.6 }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.06 } } }}
            aria-label={t('قرى نحفظها', 'Villages we remember')}
          >
            {villages.map((v) => (
              <motion.li
                key={v.id}
                variants={{ hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: EASE_OUT } } }}
                className="border border-[var(--jt-stone-900)]/20 px-3 py-1 text-[13px] text-[var(--jt-stone-800)]"
              >
                {t(v.name_ar, v.name_en ?? v.name_ar)}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      </div>
    </section>
  );
}
