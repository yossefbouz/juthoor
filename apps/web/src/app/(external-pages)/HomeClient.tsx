'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { HeroSection } from '@/components/home/HeroSection';
import { DiasporaSection } from '@/components/home/DiasporaSection';
import { VillagesMarquee } from '@/components/home/VillagesMarquee';
import { FlowSection } from '@/components/home/FlowSection';
import { CtaSection } from '@/components/home/CtaSection';
import { KeffiyehBand } from '@/components/home/KeffiyehPattern';
import { FALLBACK_VILLAGES, type Village } from '@/components/home/homeContent';

/**
 * Homepage — monochrome keffiyeh edition.
 *
 * Still follows the FRS Appendix 2 (Module 2.0) content order the earlier
 * wireframe established (hero → diaspora → Who / Why / How / Contact → CTA),
 * but every section now sits on one shared 12-column grid and enters with
 * its own scroll animation:
 *
 *  00 Hero       — acid-squares shader in black & white, keffiyeh net
 *                  parallax, wordmark clip-reveal, blur-in tagline
 *  01 Diaspora   — halves slide in from opposite edges, chips stagger
 *  —  Marquee    — village names driven by scroll velocity
 *  02 On this page — the wireframe's four anchors, four different card
 *                  entrances, sticky progress rule
 *  03 Begin      — drifting keffiyeh cloth, scale-in headline, parallax strip
 *
 * All copy is Elfazee3's from the merged homepage (PR #6); nothing rewritten.
 */
export function HomeClient({ villages = [] }: { villages?: Village[] }) {
  const { dir } = useLocale();
  const names = (villages.length >= 6 ? villages : FALLBACK_VILLAGES).slice(0, 8);

  return (
    <div dir={dir} className="relative overflow-x-clip bg-[var(--jt-stone-50)] text-[var(--jt-stone-900)]">
      <HeroSection />
      <KeffiyehBand height={32} className="mb-24 border-y border-[var(--jt-stone-900)]/10 text-[#0a0a0a] md:mb-32" />
      <DiasporaSection villages={names} />
      <VillagesMarquee villages={names} />
      <FlowSection />
      <CtaSection />
    </div>
  );
}
