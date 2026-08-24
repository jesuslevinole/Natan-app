import type { ReactNode } from 'react';
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon } from 'lucide-react';
import type { SeriesVariant } from './MonthlyBars';

interface Props {
  value: SeriesVariant;
  onChange: (v: SeriesVariant) => void;
}

const OPTIONS: Array<{ id: SeriesVariant; title: string; icon: ReactNode }> = [
  { id: 'bars', title: 'Bars', icon: <BarChart3 size={14} /> },
  { id: 'line', title: 'Lines', icon: <LineIcon size={14} /> },
  { id: 'area', title: 'Area', icon: <AreaIcon size={14} /> },
];

/** Selector barras / líneas / área para las series temporales (patrón de Ana-app). */
export default function ChartTypeToggle({ value, onChange }: Props) {
  return (
    <div className="chip-group compact" role="group" aria-label="Chart type">
      {OPTIONS.map(o => (
        <button key={o.id} type="button" className={`chip${value === o.id ? ' active' : ''}`} onClick={() => onChange(o.id)} title={o.title} aria-pressed={value === o.id}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}
