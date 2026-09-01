import type { ReactNode } from 'react';
import './charts.css';

interface Props {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Contenido a la derecha del título (chips, botones, totales). */
  actions?: ReactNode;
  children: ReactNode;
  /** Ocupa dos columnas en la grilla de gráficos. */
  wide?: boolean;
  /** Alto del área del gráfico. */
  height?: 'sm' | 'md' | 'lg';
  /** Muestra un estado vacío en lugar del gráfico. */
  empty?: boolean;
  emptyMessage?: string;
  /** Identificador para capturar el SVG al exportar a PDF (data-chart-id). */
  chartId?: string;
}

/** Tarjeta contenedora de un gráfico: cabecera uniforme + área de alto fijo (recharts necesita alto definido). */
export default function ChartCard({ title, subtitle, icon, actions, children, wide = false, height = 'md', empty = false, emptyMessage = 'No data for the current filters.', chartId }: Props) {
  return (
    <section className={`chart-card${wide ? ' wide' : ''}`}>
      <header className="chart-card-head">
        {icon && <span className="chart-card-icon">{icon}</span>}
        <div className="chart-card-title">
          <h4>{title}</h4>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="chart-card-actions">{actions}</div>}
      </header>
      <div className={`chart-card-body h-${height}`} data-chart-id={chartId}>
        {empty ? <p className="chart-empty">{emptyMessage}</p> : children}
      </div>
    </section>
  );
}
