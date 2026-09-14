'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from './homeContent';

/**
 * Numbered eyebrow that opens every section — a short rule that draws in,
 * then the index and title. Keeps the page's editorial rhythm consistent.
 */
export function SectionLabel({ index, text, tone = 'ink' }: { index: string; text: string; tone?: 'ink' | 'paper' }) {
  const reduce = useReducedMotion();
  const color = tone === 'ink' ? 'text-[var(--jt-stone-900)]' : 'text-[var(--jt-stone-50)]';
  const rule = tone === 'ink' ? 'bg-[var(--jt-stone-900)]' : 'bg-[var(--jt-stone-50)]';
  return (
    <div className={`flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] ${color}`}>
      <motion.span
        aria-hidden
        className={`block h-px w-10 origin-[var(--jt-origin-start,0%)] ${rule}`}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
      />
      <motion.span
        initial={reduce ? false : { opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.5, delay: 0.25, ease: EASE_OUT }}
      >
        <span className="opacity-50">{index}</span>
        <span className="mx-2 opacity-30">—</span>
        {text}
      </motion.span>
    </div>
  );
}
