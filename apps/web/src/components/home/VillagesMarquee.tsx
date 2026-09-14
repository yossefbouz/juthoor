'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { ScrollVelocity } from '@/components/reactbits/ScrollVelocity';
import { KeffiyehBand } from '@/components/home/KeffiyehPattern';
import { PAPER, type Village } from '@/components/home/homeContent';

/**
 * Black band of village names that speeds up and reverses with the
 * reader's scroll — a keffiyeh chevron trims it top and bottom.
 */
export function VillagesMarquee({ villages }: { villages: Village[] }) {
  const { t } = useLocale();

  return (
    <section aria-label={t('قرى نحفظها', 'Villages we remember')} className="relative overflow-hidden border-y border-black/10 text-[var(--jt-stone-900)]" style={{ backgroundColor: PAPER }}>
      <KeffiyehBand className="text-black/85" height={30} />
      <div className="py-6 md:py-8">
        <ScrollVelocity baseVelocity={55}>
          {villages.map((v) => (
            <span key={v.id} className="mx-6 inline-flex items-center gap-6 text-[clamp(2.2rem,5.5vw,4.6rem)] leading-none" style={{ fontFamily: 'var(--jt-font-display)' }}>
              <span>{v.name_ar}</span>
              <span aria-hidden className="text-[0.4em] text-[var(--jt-gold-400)]">◆</span>
            </span>
          ))}
        </ScrollVelocity>
        <ScrollVelocity baseVelocity={-38} className="mt-3 opacity-45">
          {villages.map((v) => (
            <span key={v.id} className="mx-6 inline-flex items-center gap-6 text-[clamp(1rem,1.8vw,1.35rem)] uppercase tracking-[0.35em]" style={{ fontFamily: 'var(--jt-font-display-latin)' }}>
              <span>{v.name_en ?? v.name_ar}</span>
              {v.district_ar && <span className="text-[0.75em] tracking-[0.2em] text-[var(--jt-stone-500)]" style={{ fontFamily: 'var(--jt-font-display)' }}>{v.district_ar}</span>}
              <span aria-hidden className="text-[0.5em]">✦</span>
            </span>
          ))}
        </ScrollVelocity>
      </div>
      <KeffiyehBand className="text-black/85" height={30} />
    </section>
  );
}
