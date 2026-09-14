'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { SpotlightCard } from '@/components/reactbits/SpotlightCard';
import { KeffiyehPattern } from '@/components/home/KeffiyehPattern';
import { SectionLabel } from '@/components/home/SectionLabel';
import { CONTAINER, EASE_OUT, FLOW_SECTIONS, GRID } from '@/components/home/homeContent';

/**
 * Who / Why / How / Contact on a strict 4 + 8 column split. The sticky
 * heading carries a progress rule that fills as the four cards pass; each
 * card enters with its own move so no two scroll moments feel the same.
 */
export function FlowSection() {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
  const reduce = useReducedMotion();
  const Arrow = isAR ? ArrowLeft : ArrowRight;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.75'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const scaleY = useTransform(progress, [0, 1], [0, 1]);
  const lead = isAR ? 56 : -56;

  const entrances: Variants[] = [
    { hidden: { opacity: 0, x: lead, rotate: isAR ? 1.5 : -1.5 }, show: { opacity: 1, x: 0, rotate: 0 } },
    { hidden: { opacity: 0, x: -lead, rotate: isAR ? -1.5 : 1.5 }, show: { opacity: 1, x: 0, rotate: 0 } },
    { hidden: { opacity: 0, y: 56, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1 } },
    { hidden: { opacity: 0, rotateX: -32, y: 28, transformPerspective: 900 }, show: { opacity: 1, rotateX: 0, y: 0, transformPerspective: 900 } },
  ];

  return (
    <section ref={ref} className={`${CONTAINER} py-24 md:py-32`}>
      <div className={`${GRID} gap-y-12`}>
        <div className="col-span-12 lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <SectionLabel index="02" text={t('في هذه الصفحة', 'On this page')} />
            <nav aria-label={t('في هذه الصفحة', 'On this page')} className="mt-6 flex gap-4">
              <div aria-hidden className="relative w-px self-stretch bg-[var(--jt-stone-900)]/15">
                <motion.div className="absolute inset-0 origin-top bg-[var(--jt-stone-900)]" style={{ scaleY }} />
              </div>
              <ol className="flex flex-col gap-3">
                {FLOW_SECTIONS.map((s) => (
                  <li key={s.ref}>
                    <a
                      href={`#${s.ref}`}
                      className="group inline-flex items-baseline gap-3 text-[15px] font-semibold text-[var(--jt-stone-800)] transition-colors hover:text-[var(--jt-gold-600)]"
                    >
                      <span className="text-[11px] tracking-[0.2em] text-[var(--jt-stone-400)]" style={{ fontFamily: 'var(--jt-font-mono)' }}>
                        {s.ref}
                      </span>
                      <span className="border-b border-transparent transition-colors group-hover:border-current">{t(s.titleAr, s.titleEn)}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>

        <ol className="col-span-12 grid gap-6 md:grid-cols-2 lg:col-span-8">
          {FLOW_SECTIONS.map((s, i) => (
            <motion.li
              key={s.ref}
              id={s.ref}
              className="scroll-mt-28"
              initial={reduce ? { opacity: 0 } : 'hidden'}
              whileInView={reduce ? { opacity: 1 } : 'show'}
              viewport={{ once: true, amount: 0.4 }}
              variants={entrances[i]}
              transition={{ duration: 0.85, ease: EASE_OUT }}
            >
              <SpotlightCard className="group h-full border border-[var(--jt-stone-900)]/15 bg-white transition-transform duration-500 hover:-translate-y-1">
                <div aria-hidden className="h-2 border-b border-[var(--jt-stone-900)]/15 text-[var(--jt-stone-900)]">
                  <KeffiyehPattern variant="chevron" size={14} strokeWidth={0.7} />
                </div>
                <div className="p-7 md:p-8">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center bg-[var(--jt-stone-900)] text-[var(--jt-stone-50)] transition-colors group-hover:bg-[var(--jt-gold-500)] group-hover:text-[#0a0a0a]">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-semibold tracking-[0.3em] text-[var(--jt-stone-400)]" style={{ fontFamily: 'var(--jt-font-mono)' }}>
                      {s.ref}
                    </span>
                  </div>
                  <h3
                    className="mt-7 text-[1.45rem] font-bold leading-tight text-[var(--jt-stone-900)]"
                    style={{ fontFamily: isAR ? 'var(--jt-font-display)' : 'var(--jt-font-display-latin)', fontWeight: isAR ? 700 : 500 }}
                  >
                    {t(s.titleAr, s.titleEn)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--jt-stone-600)]">{t(s.bodyAr, s.bodyEn)}</p>
                  <Link
                    href={s.href}
                    className="mt-6 inline-flex items-center gap-2 border-b border-[var(--jt-stone-900)] pb-0.5 text-sm font-semibold text-[var(--jt-stone-900)] transition-[gap,color,border-color] hover:gap-3 hover:border-[var(--jt-gold-500)] hover:text-[var(--jt-gold-600)]"
                  >
                    {t('اقرأ المزيد', 'Learn more')}
                    <Arrow className="h-4 w-4" />
                  </Link>
                </div>
              </SpotlightCard>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
