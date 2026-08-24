import type { CSSProperties } from 'react';

interface Props {
  value: number;
  total: number;
  /** Muestra el número absoluto además del porcentaje. */
  showValue?: boolean;
}

/** Barra de participación (valor / total) para tablas de ranking. */
export default function ShareBar({ value, total, showValue = true }: Props) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <span className="share-bar" title={`${pct}% of ${total}`}>
      {showValue && <span className="share-bar-value">{value}</span>}
      <span className="share-bar-track"><span className="share-bar-fill" style={{ '--progress': `${pct}%` } as CSSProperties} /></span>
      <span className="share-bar-pct">{pct}%</span>
    </span>
  );
}
