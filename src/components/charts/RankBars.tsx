import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import ChartTooltip from './ChartTooltip';
import { CHART_COLORS, COLOR_PRIMARY, truncate } from './chartUtils';

export interface RankItem {
  name: string;
  value: number;
}

interface Props {
  data: RankItem[];
  max?: number;
  /** Un color por barra (ranking) o un solo color. */
  multicolor?: boolean;
  valueName?: string;
}

/** Barras horizontales ordenadas de mayor a menor (top N). */
export default function RankBars({ data, max = 8, multicolor = false, valueName = 'Total' }: Props) {
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, max);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }} barCategoryGap="22%">
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={150} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: string) => truncate(v, 24)} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" name={valueName} radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((r, i) => <Cell key={r.name} fill={multicolor ? CHART_COLORS[i % CHART_COLORS.length] : COLOR_PRIMARY} />)}
          <LabelList dataKey="value" position="right" fontSize={11} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
