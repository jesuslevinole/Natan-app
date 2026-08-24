import type { CSSProperties } from 'react';
import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface Props extends TooltipProps<ValueType, NameType> {
  /** Formatea el valor (ej. agregar "units"). */
  format?: (value: number, name: string) => string;
  /** Muestra el total de todas las series debajo. */
  showTotal?: boolean;
}

/** Tooltip con las clases de la app (recharts trae estilos inline por defecto). */
export default function ChartTooltip({ active, payload, label, format, showTotal = false }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((sum, p) => sum + Number(p.value ?? 0), 0);
  return (
    <div className="chart-tooltip">
      {label !== undefined && label !== '' && <p className="chart-tooltip-label">{String(label)}</p>}
      <ul>
        {payload.map(p => (
          <li key={String(p.dataKey ?? p.name)}>
            <span className="chart-tooltip-swatch" style={{ '--swatch': p.color ?? '#64748b' } as CSSProperties} />
            <span className="chart-tooltip-name">{String(p.name)}</span>
            <span className="chart-tooltip-value">{format ? format(Number(p.value ?? 0), String(p.name)) : String(p.value)}</span>
          </li>
        ))}
      </ul>
      {showTotal && payload.length > 1 && <p className="chart-tooltip-total">Total <b>{total}</b></p>}
    </div>
  );
}
