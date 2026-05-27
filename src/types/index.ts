import { ReactNode } from 'react';

export interface User { 
  uid: string;
  username: string; 
  firstName?: string; // 🔥 NUEVO
  lastName?: string;  // 🔥 NUEVO
  email: string;
  roleId: string; 
}

export interface SystemUser {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  status: 'Pending' | 'Active';
  createdAt: string;
}

export interface Role {
  id: string;
  name: string; 
  permissions: string[]; 
}

export interface LogEntry {
  id?: string;
  timestamp: string;
  user: string;
  action: 'LOGIN' | 'CREATE' | 'UPDATE' | 'DELETE';
  module: string; 
  targetId?: string; 
  details: string; 
  payload?: any; 
}

export interface JobOrder {
  id: string; 
  seq?: number; 
  visualSeq?: number; 
  jobOrder: string; 
  destination: string; 
  description: string;
  workFinish: 'YES' | 'NO'; 
  pendingWork: string; 
  schedule: string; 
  createdBy: string;
  createdAt: string; 
}

export interface JobProduct {
  id?: string; 
  jobOrderId: string; 
  itemEntranceId: string; 
  // 🔥 NUEVO: referencia al detalle específico dentro del PO.
  // Es opcional para mantener compatibilidad con registros antiguos donde
  // cada itemEntrance era un solo producto y este campo no existía.
  entranceDetailId?: string;
  modelPart: string;
  serial: string; 
  po: string; 
  quantity: number; 
  itemName: string;
}

// 🔥 NUEVO: cada producto dentro de un PO (Item Entrance).
// Un PO puede tener múltiples detalles (productos distintos).
export interface EntranceDetail {
  detailId: string;       // ID único generado en cliente para identificar el detalle dentro del array
  itemName: string;
  modelPart: string;
  serial: string;
  orderDate: string;      // Arrived Date por producto
  itemsArrived: number;   // Total inicial recibido para este producto
}

export interface ItemEntranceRecord {
  id: string; 
  seq?: number; 
  visualSeq?: number; 
  createdAt?: string; 
  date: string;            // Date (Registration) — header
  po: string;              // PO # — header (consecutivo: PO000, PO001, ...)
  supplyCompany: string;   // Supply Company — header

  // 🔥 NUEVO: array de productos asociados al PO
  details?: EntranceDetail[];

  // ⚠️ Campos LEGACY (se mantienen opcionales para compatibilidad con registros antiguos
  // creados antes de la migración a estructura header/detail).
  // En registros nuevos se llenan a partir del primer detalle para no romper otras vistas.
  modelPart?: string; 
  serial?: string; 
  orderDate?: string; 
  quantityOrdered?: number; 
  itemsArrived?: number; 
  itemName?: string;
}

export type JobFormData = Omit<JobOrder, 'id' | 'createdBy' | 'seq' | 'visualSeq'>;
export type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
// 🔥 ItemEntranceFormData ahora refleja el header + el array de detalles editable en el modal.
export type ItemEntranceFormData = Omit<ItemEntranceRecord, 'id' | 'seq' | 'visualSeq' | 'createdAt'>;
export type FieldType = 'text' | 'number' | 'select';

export interface CatalogField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

export interface CatalogSchema {
  id: string;
  title: string;
  icon: ReactNode;
  fields: CatalogField[];
}