import type { CSSProperties } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import type { LogAction, WorkFinish } from '../types';
import { formatDateDisplay, getTodayString } from '../utils/helpers';

/** YES / NO de "Work Finish". */
export function WorkFinishBadge({ value }: { value: WorkFinish }) {
  return <span className={`badge outlined ${value === 'YES' ? 'yes' : 'no'}`}>{value}</span>;
}

/** AVAILABLE / UNAVAILABLE de inventario. */
export function StockBadge({ available }: { available: boolean }) {
  return <span className={`badge solid ${available ? 'success' : 'danger'}`}>{available ? 'AVAILABLE' : 'UNAVAILABLE'}</span>;
}

/** Acción del log de auditoría. */
export function ActionBadge({ action }: { action: LogAction }) {
  return <span className={`badge ${action.toLowerCase()}`}>{action}</span>;
}

/** Pending / Active / Suspended de usuarios. */
export function UserStatusBadge({ status }: { status: string }) {
  const variant = status === 'Active' ? 'create' : status === 'Suspended' ? 'danger' : 'warning';
  return <span className={`badge ${variant}`}>{status}</span>;
}

/**
 * Fecha programada con semáforo: vencida (rojo), hoy (ámbar), futura (azul).
 * Las órdenes terminadas se muestran neutras.
 */
export function ScheduleCell({ date, finished = false }: { date?: string; finished?: boolean }) {
  if (!date) return <span className="dt-dash">—</span>;
  const today = getTodayString();
  let variant = 'upcoming';
  if (finished) variant = 'done';
  else if (date < today) variant = 'overdue';
  else if (date === today) variant = 'today';
  return (
    <span className={`schedule-cell ${variant}`}>
      {variant === 'overdue' && <AlertTriangle size={13} />}
      {variant === 'today' && <Clock size={13} />}
      {formatDateDisplay(date)}
    </span>
  );
}

/** "stock / total" con barra proporcional; ámbar por debajo del 25 %, rojo cuando se agotó. */
export function StockLevel({ stock, total }: { stock: number; total: number }) {
  const pct = total > 0 ? Math.round((stock / total) * 100) : 0;
  const variant = stock <= 0 ? 'empty' : pct <= 25 ? 'low' : 'ok';
  return (
    <span className={`stock-level ${variant}`} title={`${pct}% remaining`}>
      <span className="stock-level-text">{stock} / {total}</span>
      <span className="stock-level-bar"><span className="stock-level-fill" style={{ '--progress': `${pct}%` } as CSSProperties} /></span>
    </span>
  );
}
