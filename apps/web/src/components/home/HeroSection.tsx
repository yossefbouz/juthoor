'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useTransform, type Variants } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { BlurText } from '@/components/reactbits/BlurText';
import { Magnet } from '@/components/reactbits/Magnet';
import { CountUp } from '@/components/home/CountUp';
import { CONTAINER, EASE_OUT, GRID, INK, PAPER, STATS, headingFont } from '@/components/home/homeContent';

const Silk = dynamic(() => import('@/components/reactbits/Silk').then((m) => m.Silk), { ssr: false });

/**
 * Black-on-paper opening: React Bits' Silk shader in light grey and the
 * جذور wordmark as the single focal point. The key-of-return photograph is
 * demoted to a small medallion so it accents the brand instead of competing
 * with it.
 */
export function HeroSection() {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
  const reduce = useReducedMotion();
  const Arrow = isAR ? ArrowLeft : ArrowRight;

  const { scrollY } = useScroll();
  const contentY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 90]);
  const contentOpacity = useTransform(scrollY, [0, 520], [1, reduce ? 1 : 0.15]);

  const rise: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
  };
  const wordmarkClip = isAR ? ['inset(0 0 0 100%)', 'inset(0 0 0 0%)'] : ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'];

  return (
    <section className="jt-grain-paper relative isolate overflow-hidden text-[var(--jt-stone-900)]" style={{ backgroundColor: PAPER }}>
      {/* layer 0 — flowing light-grey silk (React Bits Silk, light mode) */}
      <div aria-hidden className="absolute inset-0 -z-30">
        <Silk color="#D8D5CF" speed={4} scale={1} noiseIntensity={1.2} rotation={0.25} lightMode />
      </div>
      {/* layer 2 — vignette so type stays legible */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 40%, rgba(248,244,238,0) 0%, rgba(248,244,238,0.35) 60%, rgba(248,244,238,0.8) 100%), linear-gradient(to bottom, rgba(248,244,238,0.5), rgba(248,244,238,0) 30%)',
        }}
      />

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className={`${CONTAINER} relative`}>
        <div className={`${GRID} min-h-[calc(100svh-4rem)] items-center gap-y-10 pb-16 pt-12 md:pt-14`}>
          {/* wordmark + copy */}
          <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.14, delayChildren: 0.15 } } }} className="col-span-12 lg:col-span-8">
            <motion.p variants={rise} className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium uppercase tracking-[0.24em]">
              <span className="text-[var(--jt-stone-800)]">{t('من الفلسطينيين، عن الفلسطينيين، للفلسطينيين', 'By Palestinians, For Palestinians')}</span>
              <span className="hidden h-px w-8 bg-black/25 sm:block" aria-hidden />
              <span className="text-[var(--jt-stone-500)]">{t('غير ربحيّة · مجّانية للأبد · بدون إعلانات', 'Non-profit · Free forever · No ads')}</span>
            </motion.p>

            <div className="relative inline-flex flex-col items-start">
              <motion.p
                aria-hidden
                className="select-none leading-[1.05] text-[clamp(3.4rem,8.5vw,6.5rem)] font-medium"
                style={{ fontFamily: isAR ? 'var(--jt-font-kufi)' : 'var(--jt-font-display-latin)', color: INK }}
                initial={reduce ? { opacity: 0 } : { clipPath: wordmarkClip[0], opacity: 1 }}
                animate={reduce ? { opacity: 1 } : { clipPath: wordmarkClip[1] }}
                transition={{ duration: 1.25, ease: EASE_OUT, delay: 0.25 }}
              >
                {isAR ? 'جذور' : 'Juthoor'}
              </motion.p>
              <motion.p
                variants={rise}
                className="mt-0.5 text-[12px] font-normal tracking-[0.02em] text-[var(--jt-stone-500)]"
                style={{ fontFamily: isAR ? 'var(--jt-font-sans-latin)' : 'var(--jt-font-kufi)' }}
              >
                {isAR ? 'Juthoor' : 'جذور'}
              </motion.p>
            </div>

            <div className="mt-8 max-w-2xl">
              <BlurText
                as="h1"
                text={t('شجرة عائلة واحدة لـجميع الفلسطينيين في كل مكان.', 'One family tree for all Palestinians, everywhere.')}
                className="text-[clamp(1.25rem,2.3vw,1.8rem)] font-medium leading-[1.55]"
                style={{ fontFamily: headingFont(isAR), fontWeight: 500 }}
                delay={70}
                startDelay={0.9}
              />
              <motion.p variants={rise} className="mt-5 max-w-xl text-[16px] font-normal leading-[1.85] text-[var(--jt-stone-600)]">
                {t(
                  'كل عائلة تُسجَّل هي عائلة تُذكر. ابحث عن أقاربك، وابنِ شجرتك، وأعد ربطها بشجرة العائلة الفلسطينية الأوسع — بيتًا بيتًا، وقريةً قريةً، وجيلًا بعد جيل.',
                  'Every family recorded is a family remembered. Search for your relatives, build your tree, and reconnect it to the wider Palestinian Family Tree — one household, one village, one generation at a time.',
                )}
              </motion.p>
            </div>

            <motion.div variants={rise} className="mt-8 flex flex-wrap items-center gap-4">
              <Magnet padding={60} strength={4}>
                <Link
                  href="/sign-up"
                  className="jt-btn-shine inline-flex items-center gap-2.5 bg-[var(--jt-gold-500)] px-6 py-3 text-[13.5px] font-medium text-[#0a0a0a] transition-colors hover:bg-[var(--jt-gold-400)]"
                >
                  {t('ابدأ بناء شجرة عائلتك', 'Start your own family tree')}
                  <Arrow className="h-4 w-4" />
                </Link>
              </Magnet>
              <Link
                href="/search"
                className="group inline-flex items-center gap-2.5 border border-black/30 px-6 py-3 text-[13.5px] font-medium text-[var(--jt-stone-900)] transition-colors hover:border-black hover:bg-[#0a0a0a] hover:text-white"
              >
                {t('ابحث في شجرة العائلة الفلسطينية', 'Search the Palestinian Family Tree')}
              </Link>
            </motion.div>
          </motion.div>

          {/* medallion — the key of return, demoted to an accent */}
          <motion.figure
            className="col-span-12 flex flex-col items-center gap-4 lg:col-span-4 lg:items-end"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.82, rotate: -6 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.1, ease: EASE_OUT, delay: 1.0 }}
          >
            <div className="relative h-40 w-40 md:h-52 md:w-52">
              <svg aria-hidden viewBox="0 0 100 100" className="jt-spin-slow absolute inset-0 h-full w-full text-black/65">
                <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.2 3.2" />
                <circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.4" strokeOpacity="0.8" />
              </svg>
              <div className="absolute inset-[13%] overflow-hidden rounded-full border border-black/15 bg-[var(--jt-stone-100)]">
                <Image
                  src="/images/hero-key.jpg"
                  alt={t('يد جدّ ويد طفل تمسكان مفتاحًا حديديًا قديمًا — مفتاح العودة', "An elder's hand and a child's hand holding an old iron key — the key of return")}
                  fill
                  sizes="(max-width: 768px) 176px, 224px"
                  className="object-cover grayscale contrast-125 brightness-90"
                  style={{ objectPosition: '50% 40%' }}
                  priority
                />
              </div>
            </div>
            <figcaption className="text-[11px] font-normal uppercase tracking-[0.24em] text-[var(--jt-stone-500)]">
              {t('مفتاح العودة', 'The key of return')}
            </figcaption>
          </motion.figure>

          {/* stats strip */}
          <motion.dl
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: 1.3 } } }}
            className="col-span-12 grid grid-cols-1 gap-y-6 border-t border-black/15 pt-6 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3"
          >
            {STATS.map((s) => (
              <motion.div key={s.labelEn} variants={rise}>
                <dt className="order-2 mt-2 max-w-[17rem] text-[12px] leading-relaxed text-[var(--jt-stone-500)]">{t(s.labelAr, s.labelEn)}</dt>
                <dd className="text-[1.9rem] leading-none tracking-[-0.01em] md:text-[2.3rem]" style={{ fontFamily: 'var(--jt-font-sans-latin)', fontWeight: 300 }}>
                  <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} duration={2} />
                </dd>
              </motion.div>
            ))}
          </motion.dl>
        </div>
      </motion.div>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
        <span className="jt-cue flex h-9 w-9 items-center justify-center rounded-full border border-black/30 text-black/70">
          <ArrowDown className="h-4 w-4" />
        </span>
      </div>
    </section>
  );
}
