import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ChartTooltip from './ChartTooltip';
import { monthLabel } from './chartUtils';

export type SeriesVariant = 'bars' | 'line' | 'area';

export interface MonthlySeries {
  key: string;
  name: string;
  color: string;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM (o cualquier categoría si se pasa xKey/xFormatter)
  [series: string]: string | number;
}

interface Props {
  data: MonthlyPoint[];
  series: MonthlySeries[];
  stacked?: boolean;
  /** Campo del eje X (por defecto `month`) y cómo formatearlo. */
  xKey?: string;
  xFormatter?: (value: string) => string;
  /** Barras (default), líneas o área. Ver ChartTypeToggle. */
  variant?: SeriesVariant;
}

/** Serie temporal por categoría (por defecto meses) en barras, líneas o área. */
export default function MonthlyBars({ data, series, stacked = true, xKey = 'month', xFormatter = monthLabel, variant = 'bars' }: Props) {
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey={xKey} tickFormatter={xFormatter} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
      <Tooltip content={<ChartTooltip showTotal={series.length > 1} />} labelFormatter={(v) => xFormatter(String(v))} />
      <Legend iconType="circle" iconSize={8} />
    </>
  );
  const margin = { top: 8, right: 8, left: -18, bottom: 0 };

  if (variant === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={margin}>
          {axes}
          {series.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }} />)}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (variant === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={margin}>
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          {axes}
          {series.map(s => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} fill={`url(#grad-${s.key})`} stackId={stacked ? 'a' : undefined} />)}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barCategoryGap="28%">
        {axes}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={i === series.length - 1 || !stacked ? [4, 4, 0, 0] : 0} maxBarSize={42} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
