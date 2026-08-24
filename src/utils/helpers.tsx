import { MapPin, Building2, Tag } from 'lucide-react';
import type { CatalogSchema } from '../types';

/** Configuración maestra de los catálogos del sistema */
export const catalogsConfig: Record<string, CatalogSchema> = {
  destinations: {
    id: 'destinations',
    title: 'Destinations',
    icon: <MapPin size={32} />,
    importable: true,
    fields: [
      { name: 'description', label: 'Address', type: 'text', required: true },
      { name: 'property', label: 'Property / Complex', type: 'text' },
      { name: 'street', label: 'Street', type: 'text', hiddenInTable: true },
      { name: 'unit', label: 'Unit #', type: 'number', hiddenInTable: true },
      { name: 'contact', label: 'Contact', type: 'text', hiddenInTable: true },
    ],
  },
  supply_companies: {
    id: 'supply_companies',
    title: 'Supply Companies',
    icon: <Building2 size={32} />,
    fields: [
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'text' },
    ],
  },
  item_names: {
    id: 'item_names',
    title: 'Item Names',
    icon: <Tag size={32} />,
    fields: [
      { name: 'item_name', label: 'Item Name', type: 'text', required: true },
      { name: 'category', label: 'Category / Brand', type: 'text' },
    ],
  },
};

export const getTodayString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Formatea fechas (YYYY-MM-DD o ISO) en formato corto en español: "15 abr 2026". */
export const formatDateDisplay = (dateStr?: string): string => {
  if (!dateStr) return '-';
  // Normalización para prevenir desajustes de zona horaria en fechas sin hora.
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
  const dateObj = new Date(normalized);
  return isNaN(dateObj.getTime()) ? dateStr : dateFormatter.format(dateObj);
};

/** Formatea un ISO string con fecha y hora: "15/04/2026, 14:30". */
export const formatDateTimeDisplay = (isoString: string): string => {
  const d = new Date(isoString);
  return isNaN(d.getTime()) ? isoString : dateTimeFormatter.format(d);
};

export const formatSeq = (seq?: number): string => String(seq || 0).padStart(3, '0');

/** Nombre a mostrar de un usuario: "Nombre Apellido" o el fallback (email/username). */
export const displayName = (u: { firstName?: string; lastName?: string }, fallback: string): string =>
  `${u.firstName || ''} ${u.lastName || ''}`.trim() || fallback;

/** Búsqueda case-insensitive sobre varios campos de texto. */
export const matchesSearch = (term: string, ...values: Array<string | number | undefined | null>): boolean => {
  if (!term) return true;
  const t = term.toLowerCase();
  return values.some(v => v !== undefined && v !== null && String(v).toLowerCase().includes(t));
};
