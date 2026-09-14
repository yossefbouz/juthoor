'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

/**
 * Floating card navigation, after React Bits CardNav (MIT) — GSAP swapped
 * for framer-motion, `<img>` logo swapped for a slot, and the top-bar
 * actions (locale / theme / CTA) passed in as children so the host owns
 * them. Direction-aware: uses logical start/end so RTL just works.
 */
export type CardNavLink = { label: string; href: string; ariaLabel?: string; disabled?: boolean; badge?: string };

export type CardNavItem = { label: string; bgColor: string; textColor: string; links: CardNavLink[] };

type CardNavProps = {
  logo: ReactNode;
  items: CardNavItem[];
  /** rendered at the end of the top bar (locale toggle, CTA, …) */
  actions?: ReactNode;
  baseColor?: string;
  borderColor?: string;
  menuColor?: string;
  openLabel?: string;
  closeLabel?: string;
  className?: string;
  style?: React.CSSProperties;
};

const BAR_HEIGHT = 60;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CardNav({
  logo,
  items,
  actions,
  baseColor = '#ffffff',
  borderColor = 'rgba(0,0,0,0.15)',
  menuColor = '#0a0a0a',
  openLabel = 'Open menu',
  closeLabel = 'Close menu',
  className = '',
  style,
}: CardNavProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`sticky top-3 z-50 mx-auto w-[94%] max-w-6xl ${className}`} style={{ height: BAR_HEIGHT, ...style }}>
      <motion.nav
        aria-label="Primary"
        className="absolute inset-x-0 top-0 overflow-hidden shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)]"
        style={{ backgroundColor: baseColor, border: `1px solid ${borderColor}` }}
        initial={false}
        animate={{ height: open ? 'auto' : BAR_HEIGHT }}
        transition={{ duration: reduce ? 0 : 0.42, ease: EASE }}
      >
        {/* top bar */}
        <div className="flex items-center justify-between gap-3 px-3" style={{ height: BAR_HEIGHT }}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? closeLabel : openLabel}
            aria-expanded={open}
            className="group flex h-full w-11 shrink-0 flex-col items-center justify-center gap-[6px]"
            style={{ color: menuColor }}
          >
            <span className={`h-[2px] w-[28px] bg-current transition-transform duration-300 ${open ? 'translate-y-[4px] rotate-45' : ''} group-hover:opacity-70`} />
            <span className={`h-[2px] w-[28px] bg-current transition-transform duration-300 ${open ? '-translate-y-[4px] -rotate-45' : ''} group-hover:opacity-70`} />
          </button>

          <div className="flex min-w-0 items-center md:absolute md:left-1/2 md:top-0 md:-translate-x-1/2" style={{ height: BAR_HEIGHT }}>
            {logo}
          </div>

          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>

        {/* cards */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="cards"
              className="flex flex-col gap-2 p-2 pt-0 md:h-[210px] md:flex-row md:items-stretch md:gap-3"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: 0.08 } } }}
            >
              {items.slice(0, 3).map((item) => (
                <motion.div
                  key={item.label}
                  variants={{ hidden: { opacity: 0, y: reduce ? 0 : 40 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
                  className="flex min-h-[64px] flex-1 flex-col gap-2 px-4 py-3 md:min-h-0"
                  style={{ backgroundColor: item.bgColor, color: item.textColor }}
                >
                  <div className="text-[18px] tracking-[-0.3px] md:text-[22px]" style={{ fontFamily: 'var(--jt-font-display)' }}>
                    {item.label}
                  </div>
                  <ul className="mt-auto flex flex-col gap-[3px]">
                    {item.links.map((lnk) => (
                      <li key={lnk.label}>
                        {lnk.disabled ? (
                          <span className="inline-flex cursor-default items-center gap-1.5 text-[15px] opacity-55">
                            <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
                            {lnk.label}
                            {lnk.badge && <span className="ms-1 border border-current px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.18em]">{lnk.badge}</span>}
                          </span>
                        ) : (
                          <Link
                            href={lnk.href}
                            aria-label={lnk.ariaLabel}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1.5 text-[15px] transition-opacity hover:opacity-70"
                          >
                            <ArrowUpRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden />
                            {lnk.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </div>
  );
}
