import { useState } from 'react';
import type { SeriesVariant } from '../components/charts/MonthlyBars';

/** Estado del tipo de gráfico persistido por clave. */
export const useChartVariant = (key: string, initial: SeriesVariant = 'bars'): [SeriesVariant, (v: SeriesVariant) => void] => {
  const storageKey = `natan_chart_${key}`;
  const [variant, setVariant] = useState<SeriesVariant>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === 'bars' || saved === 'line' || saved === 'area' ? saved : initial;
    } catch { return initial; }
  });
  const set = (v: SeriesVariant) => {
    setVariant(v);
    try { localStorage.setItem(storageKey, v); } catch { /* ignore */ }
  };
  return [variant, set];
};
