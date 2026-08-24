import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import './KpiCard.css';

export type KpiTone = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'slate' | 'cyan';

export interface KpiTrend {
  /** Diferencia vs. el período anterior (positivo = subió). */
  delta: number;
  label: string;
  /** Si es true, subir es malo (ej. órdenes vencidas). */
  inverse?: boolean;
}

interface Props {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  /** Texto pequeño debajo del valor. */
  note?: string;
  trend?: KpiTrend;
  onClick?: () => void;
}

/** Tarjeta de indicador: fondo blanco, ícono en chip de color, valor grande y nota o tendencia. */
export default function KpiCard({ icon, label, value, tone = 'blue', note, trend, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  const trendDir = trend ? (trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : 'flat') : null;
  const trendGood = trend ? (trend.delta === 0 ? 'neutral' : (trend.delta > 0) !== !!trend.inverse ? 'good' : 'bad') : null;
  return (
    <Tag type={onClick ? 'button' : undefined} className={`kpi-card ${tone}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <div className="kpi-top">
        <p className="kpi-label">{label}</p>
        <div className="kpi-icon">{icon}</div>
      </div>
      <h3 className="kpi-value">{value}</h3>
      {trend && trendDir && (
        <span className={`kpi-trend ${trendGood}`}>
          {trendDir === 'up' && <TrendingUp size={13} />}
          {trendDir === 'down' && <TrendingDown size={13} />}
          {trendDir === 'flat' && <Minus size={13} />}
          {trend.delta > 0 ? `+${trend.delta}` : trend.delta} {trend.label}
        </span>
      )}
      {note && !trend && <span className="kpi-note">{note}</span>}
    </Tag>
  );
}
