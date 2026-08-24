import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartTooltip from './ChartTooltip';
import { monthLabel } from './chartUtils';

export interface MonthlySeries {
  key: string;
  name: string;
  color: string;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  [series: string]: string | number;
}

interface Props {
  data: MonthlyPoint[];
  series: MonthlySeries[];
  stacked?: boolean;
  /** Campo del eje X (por defecto `month`) y cómo formatearlo. */
  xKey?: string;
  xFormatter?: (value: string) => string;
}

/** Barras por categoría (por defecto meses): una barra por serie, apiladas si `stacked`. */
export default function MonthlyBars({ data, series, stacked = true, xKey = 'month', xFormatter = monthLabel }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey={xKey} tickFormatter={xFormatter} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <Tooltip cursor={{ fill: '#f8fafc' }} content={<ChartTooltip showTotal />} labelFormatter={(v) => xFormatter(String(v))} />
        <Legend iconType="circle" iconSize={8} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={i === series.length - 1 || !stacked ? [4, 4, 0, 0] : 0} maxBarSize={42} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
