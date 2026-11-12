export type ChartLayoutMode = 'horizontal' | 'vertical' | 'fan';

export const CHART_LAYOUT_STORAGE_KEY = 'juthoor.chartLayout';
export const CHART_LAYOUT_MODES: readonly ChartLayoutMode[] = [
  'horizontal',
  'vertical',
  'fan',
] as const;

export function parseChartLayout(
  value: string | null | undefined,
): ChartLayoutMode | null {
  if (value === 'horizontal' || value === 'vertical' || value === 'fan') {
    return value;
  }
  return null;
}

export function readStoredChartLayout(): ChartLayoutMode | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseChartLayout(window.localStorage.getItem(CHART_LAYOUT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeChartLayout(mode: ChartLayoutMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHART_LAYOUT_STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
