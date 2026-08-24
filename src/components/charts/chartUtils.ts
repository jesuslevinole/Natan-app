/** Paleta y helpers compartidos por los gráficos (Dashboard y Reports). */
export const CHART_COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#db2777', '#64748b', '#0d9488', '#ea580c'];
export const COLOR_PRIMARY = '#2563eb';
export const COLOR_SUCCESS = '#16a34a';
export const COLOR_WARNING = '#f59e0b';
export const COLOR_DANGER = '#ef4444';
export const COLOR_MUTED = '#94a3b8';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-08" a partir de "2026-08-24" (o "" si la fecha no es válida). */
export const monthKey = (date?: string): string => (date && date.length >= 7 ? date.slice(0, 7) : '');

/** "Aug 26" a partir de "2026-08". */
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  const idx = Number(m) - 1;
  return MONTHS[idx] ? `${MONTHS[idx]} ${y.slice(2)}` : key;
};

/** Últimos `n` meses terminando en `today` (YYYY-MM-DD), como claves "YYYY-MM" en orden cronológico. */
export const lastMonths = (today: string, n: number): string[] => {
  const [y, m] = today.split('-').map(Number);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
};

/** Cuenta ocurrencias y devuelve [clave, total] ordenado de mayor a menor. */
export const countBy = <T,>(items: T[], key: (item: T) => string, weight: (item: T) => number = () => 1): Array<[string, number]> => {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) || 0) + weight(item));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

/** Recorta un texto largo para ejes/leyendas. */
export const truncate = (text: string, max = 22): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
