import type { CSSProperties } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS, truncate } from './chartUtils';

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

interface Props {
  data: DonutSlice[];
  /** Texto central (por defecto el total). */
  centerLabel?: string;
  centerValue?: string | number;
  /** Máximo de porciones; el resto se agrupa en "Other". */
  maxSlices?: number;
}

/** Anillo con total al centro y leyenda a la derecha (o debajo en móvil). */
export default function DonutChart({ data, centerLabel = 'Total', centerValue, maxSlices = 6 }: Props) {
  const sorted = [...data].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  const slices = sorted.length > maxSlices
    ? [...sorted.slice(0, maxSlices - 1), { name: 'Other', value: sorted.slice(maxSlices - 1).reduce((s, d) => s + d.value, 0), color: '#cbd5e1' }]
    : sorted;
  const total = slices.reduce((s, d) => s + d.value, 0);
  const colored = slices.map((d, i) => ({ ...d, color: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }));

  return (
    <div className="donut-layout">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={colored} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="none">
              {colored.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip format={v => `${v} (${total ? Math.round((v / total) * 100) : 0}%)`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{centerValue ?? total}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {colored.map(d => (
          <li key={d.name} title={d.name}>
            <span className="chart-tooltip-swatch" style={{ '--swatch': d.color } as CSSProperties} />
            <span className="donut-legend-name">{truncate(d.name, 26)}</span>
            <span className="donut-legend-value">{d.value}</span>
            <span className="donut-legend-pct">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
