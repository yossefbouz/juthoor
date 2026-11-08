'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import type { ScoreBreakdown } from '@/lib/search/zodSchemas';

export function ScoreBreakdownPopover({
  breakdown,
  t,
}: {
  breakdown: ScoreBreakdown;
  t: <T extends string>(ar: T, en: T) => T;
}) {
  const [open, setOpen] = useState(false);
  const rows: Array<{ key: keyof ScoreBreakdown; labelAr: string; labelEn: string }> = [
    { key: 'given', labelAr: 'الاسم', labelEn: 'Given' },
    { key: 'surname', labelAr: 'اللقب', labelEn: 'Surname' },
    { key: 'free', labelAr: 'نص حر', labelEn: 'Free text' },
    { key: 'father', labelAr: 'الأب', labelEn: 'Father' },
    { key: 'mother', labelAr: 'الأم', labelEn: 'Mother' },
    { key: 'pgf', labelAr: 'الجد لأب', labelEn: 'Pat. grandfather' },
    { key: 'pggf', labelAr: 'أبو الجد لأب', labelEn: 'Pat. great-grandfather' },
    { key: 'place', labelAr: 'الأصل', labelEn: 'Origin' },
    { key: 'year', labelAr: 'سنة الميلاد', labelEn: 'Birth year' },
  ];
  const active = rows.filter((r) => (breakdown?.[r.key] ?? 0) > 0);

  if (active.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--jt-stone-400)] transition-colors hover:text-[var(--jt-olive-700)]"
        aria-label={t('تفاصيل التطابق', 'Match details')}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute end-0 top-full z-20 mt-1 w-48 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-xs shadow-[var(--jt-shadow-lg)]"
        >
          <p className="mb-2 font-semibold uppercase tracking-[0.18em] text-[var(--jt-stone-500)]">
            {t('تفاصيل التطابق', 'Match breakdown')}
          </p>
          <ul className="space-y-1">
            {active.map((r) => {
              const v = breakdown[r.key] ?? 0;
              const pct = Math.round(v * 100);
              return (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="flex-1 text-[var(--jt-stone-600)]">{t(r.labelAr, r.labelEn)}</span>
                  <span className="relative inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-[var(--jt-stone-200)]">
                    <span
                      className="absolute inset-y-0 start-0 rounded-full bg-[var(--jt-olive-600)]"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-8 text-end font-semibold text-[var(--jt-stone-700)]">{pct}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
