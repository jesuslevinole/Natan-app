import type { LogAction, WorkFinish } from '../types';

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
