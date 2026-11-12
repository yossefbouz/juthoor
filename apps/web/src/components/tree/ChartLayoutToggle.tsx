'use client';

import { GitBranch, Network, Rows3 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useLocale } from '@/contexts/LocaleContext';
import {
  type ChartLayoutMode,
  CHART_LAYOUT_MODES,
  parseChartLayout,
  readStoredChartLayout,
  storeChartLayout,
} from '@/lib/tree/chartLayout';
import { cn } from '@/lib/utils';

const LABELS: Record<ChartLayoutMode, { ar: string; en: string; icon: typeof Rows3 }> = {
  horizontal: { ar: 'أفقي', en: 'Horizontal', icon: Rows3 },
  vertical: { ar: 'عمودي', en: 'Vertical', icon: GitBranch },
  fan: { ar: 'مروحي', en: 'Fan', icon: Network },
};

/**
 * Layout mode toggle for FamilyChart. Persists to `?layout=` and localStorage.
 */
export function ChartLayoutToggle({
  value,
  onChange,
}: {
  readonly value: ChartLayoutMode;
  readonly onChange: (mode: ChartLayoutMode) => void;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(mode: ChartLayoutMode) {
    onChange(mode);
    storeChartLayout(mode);
    const next = new URLSearchParams(searchParams.toString());
    next.set('layout', mode);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label={t('تخطيط الشجرة', 'Tree layout')}
      className="flex items-center gap-0.5 rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)]/95 p-1 shadow-[var(--jt-shadow-sm)] backdrop-blur-sm"
    >
      {CHART_LAYOUT_MODES.map((mode) => {
        const meta = LABELS[mode];
        const Icon = meta.icon;
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            title={t(meta.ar, meta.en)}
            aria-label={t(meta.ar, meta.en)}
            onClick={() => select(mode)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)]',
              active
                ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                : 'text-[var(--jt-stone-600)] hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)]',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t(meta.ar, meta.en)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Resolve initial layout from URL, then localStorage, then default. */
export function useChartLayoutState(
  urlLayout: string | null | undefined,
  defaultMode: ChartLayoutMode = 'horizontal',
): [ChartLayoutMode, (mode: ChartLayoutMode) => void] {
  const fromUrl = parseChartLayout(urlLayout);
  const [mode, setMode] = useState<ChartLayoutMode>(fromUrl ?? defaultMode);

  useEffect(() => {
    if (fromUrl) {
      setMode(fromUrl);
      storeChartLayout(fromUrl);
      return;
    }
    const stored = readStoredChartLayout();
    if (stored) setMode(stored);
  }, [fromUrl]);

  return [mode, setMode];
}
