import React from 'react';
import { MapPin, Building2, Tag } from 'lucide-react';
import { CatalogSchema } from '../types';

/** Configuración maestra de los catálogos del sistema */
export const catalogsConfig: Record<string, CatalogSchema> = {
  destinations: {
    id: 'destinations', 
    title: 'Destinations',
    // Usamos React.createElement para evitar errores de JSX en archivos puramente .ts o .tsx de utilidades
    icon: React.createElement(MapPin, { size: 32 }),
    fields: [
      { name: 'property_name', label: 'Property Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'contact', label: 'Contact', type: 'text' }
    ]
  },
  supply_companies: {
    id: 'supply_companies', 
    title: 'Supply Companies',
    icon: React.createElement(Building2, { size: 32 }),
    fields: [
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'text' }
    ]
  },
  // 🔥 NUEVO CATÁLOGO AGREGADO: Item Names
  item_names: {
    id: 'item_names',
    title: 'Item Names',
    icon: React.createElement(Tag, { size: 32 }),
    fields: [
      { name: 'item_name', label: 'Item Name', type: 'text', required: true },
      { name: 'category', label: 'Category / Brand', type: 'text' }
    ]
  }
};

/** Devuelve los estilos dinámicos para el estado YES/NO */
export const getStatusStyles = (status: 'YES' | 'NO' | string): React.CSSProperties => ({
  backgroundColor: status === 'YES' ? '#edf7ed' : '#fdf0f0', 
  color: status === 'YES' ? '#1e4620' : '#d32f2f',
  padding: '6px 12px',
  borderRadius: '20px',
  fontSize: '0.75rem',
  fontWeight: 'bold',
  border: `1px solid ${status === 'YES' ? '#4caf50' : '#ef5350'}`,
  display: 'inline-block',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
});

/** Devuelve los estilos dinámicos para el inventario */
export const getInventoryStatusStyles = (isAvailable: boolean): React.CSSProperties => ({
  backgroundColor: isAvailable ? '#10b981' : '#ef4444', 
  color: '#ffffff',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '0.7rem',
  fontWeight: 'bold',
  display: 'inline-block',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  letterSpacing: '0.5px'
});

export const getTodayString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '-';
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${month}/${day}/${year}`;
    }
    return cleanDate;
  } catch { return dateStr; }
};

export const formatSeq = (seq?: number): string => {
  return String(seq || 0).padStart(3, '0');
};