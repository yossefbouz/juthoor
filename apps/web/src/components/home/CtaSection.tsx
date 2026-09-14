'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Magnet } from '@/components/reactbits/Magnet';
import { KeffiyehPattern } from '@/components/home/KeffiyehPattern';
import { SectionLabel } from '@/components/home/SectionLabel';
import { CONTAINER, EASE_OUT, GRID, PAPER } from '@/components/home/homeContent';

/**
 * Closing call to action on a full keffiyeh cloth (leaves / chevron / net)
 * that drifts diagonally; the village panorama rides a parallax strip on
 * the trailing columns.
 */
export function CtaSection() {
  const { t, locale } = useLocale();
  const isAR = locale === 'ar';
  const reduce = useReducedMotion();
  const Arrow = isAR ? ArrowLeft : ArrowRight;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const panoramaY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : -40, reduce ? 0 : 40]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden border-t border-black/10 text-[var(--jt-stone-900)]" style={{ backgroundColor: PAPER }}>
      <div aria-hidden className="absolute -inset-11 -z-10 text-[#0a0a0a] opacity-[0.15]">
        <div className="jt-cloth-drift h-full w-full">
          <KeffiyehPattern variant="full" size={44} strokeWidth={1} />
        </div>
      </div>
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(90% 70% at 30% 50%, rgba(248,244,238,0.2) 0%, rgba(248,244,238,0.9) 100%)' }} />

      <div className={`${CONTAINER} py-24 md:py-32`}>
        <div className={`${GRID} items-end gap-y-14`}>
          <div className="col-span-12 lg:col-span-7">
            <SectionLabel index="03" text={t('ابدأ', 'Begin')} />
            <motion.h2
              className="mt-7 text-[clamp(2.2rem,5vw,4.2rem)] font-bold leading-[1.12]"
              style={{ fontFamily: isAR ? 'var(--jt-font-display)' : 'var(--jt-font-display-latin)', fontWeight: isAR ? 700 : 400 }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 24 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.9, ease: EASE_OUT }}
            >
              {t('لا يمكن لقصة عائلتك ان تنسى أو ان تمحى.', "Your family's story belongs here.")}
            </motion.h2>
            <motion.p
              className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--jt-stone-700)]"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.2 }}
            >
              {t('لن يستغرق البدء ببناء شجرة عائلتك أكثر من عشر دقائق.', 'It takes about ten minutes to begin.')}
            </motion.p>
            <motion.div
              className="mt-9 flex flex-wrap items-center gap-4"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.35 }}
            >
              <Magnet padding={70} strength={3.5}>
                <Link
                  href="/sign-up"
                  className="jt-btn-shine inline-flex items-center gap-2.5 bg-[var(--jt-gold-500)] px-8 py-4 text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[var(--jt-gold-400)]"
                >
                  {t('ابدأ بناء شجرة عائلتك', 'Create your family tree')}
                  <Arrow className="h-5 w-5" />
                </Link>
              </Magnet>
            </motion.div>
          </div>

          <motion.div
            className="col-span-12 lg:col-span-5"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
          >
            <div className="relative overflow-hidden border border-black/25 bg-white">
              <div aria-hidden className="h-4 border-b border-black/25 text-black/85">
                <KeffiyehPattern variant="chevron" size={20} strokeWidth={0.9} />
              </div>
              <div className="relative h-52 overflow-hidden md:h-64">
                <motion.div className="absolute -inset-y-10 inset-x-0" style={{ y: panoramaY }}>
                  <Image
                    src="/images/home/village-panorama.png"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 520px"
                    className="object-cover grayscale contrast-125"
                    style={{ objectPosition: 'center 70%' }}
                  />
                </motion.div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-white/50 via-transparent to-white/20" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
