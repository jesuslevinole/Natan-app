import type { ReactNode } from 'react';
import './KpiCard.css';

export type KpiTone = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'slate';

interface Props {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  /** Texto pequeño debajo del valor. */
  note?: string;
  onClick?: () => void;
}

export default function KpiCard({ icon, label, value, tone = 'blue', note, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`kpi-card ${tone}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-text">
        <p className="kpi-label">{label}</p>
        <h3 className="kpi-value">{value}</h3>
        {note && <span className="kpi-note">{note}</span>}
      </div>
    </Tag>
  );
}
