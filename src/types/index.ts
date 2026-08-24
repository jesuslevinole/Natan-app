import type { ReactNode } from 'react';

// =========================================
// Auth & security
// =========================================
export interface User {
  uid: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email: string;
  roleId: string;
}

export type UserStatus = 'Pending' | 'Active' | 'Suspended';

export interface SystemUser {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  status: UserStatus;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export type LogAction = 'LOGIN' | 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT';

export interface LogEntry {
  id?: string;
  timestamp: string;
  user: string;
  action: LogAction;
  module: string;
  targetId?: string;
  details: string;
  // El payload es una copia del documento afectado; su forma depende del módulo,
  // por eso se tipa como `unknown` y se serializa (JSON) solo para mostrarlo.
  payload?: unknown;
}

// =========================================
// Work Activity (órdenes de trabajo)
// =========================================
export type WorkFinish = 'YES' | 'NO';

export interface JobOrder {
  id: string;
  seq?: number;
  visualSeq?: number;
  jobOrder: string;      // "Ordered by" — nombre del usuario que registró la orden
  madeBy?: string;       // "Made by" — técnico asignado
  destination: string;   // Dirección (description del catálogo de destinos)
  description: string;
  workFinish: WorkFinish;
  pendingWork: string;
  schedule: string;      // YYYY-MM-DD
  createdBy: string;
  createdAt: string;     // YYYY-MM-DD (Registration Date)
}

export interface JobProduct {
  id?: string;
  jobOrderId: string;
  itemEntranceId: string;
  // Referencia al detalle específico dentro del PO. Opcional por compatibilidad
  // con registros antiguos donde cada itemEntrance era un solo producto.
  entranceDetailId?: string;
  modelPart: string;
  serial: string;
  po: string;
  quantity: number;
  itemName: string;
}

// =========================================
// Item Entrance (inventario / POs)
// =========================================
export interface EntranceDetail {
  detailId: string;      // ID único generado en cliente dentro del array
  itemName: string;
  modelPart: string;
  serial: string;
  orderDate: string;     // Arrived Date por producto
  itemsArrived: number;  // Total inicial recibido para este producto
  // Campos del reporte de inventario del cliente (opcionales; llegan por importación o por el formulario)
  category?: string;     // "PLUMBING", "AC, HVAC", ...
  price?: number;        // Precio unitario
  invoice?: string;      // Factura del proveedor
  warrantyExp?: string;  // YYYY-MM-DD
  manufacturer?: string; // "AO SMITH", "GE"
  comments?: string;
}

export interface ItemEntranceRecord {
  id: string;
  seq?: number;
  visualSeq?: number;
  createdAt?: string;
  date: string;          // Date (Registration) — header
  po: string;            // PO # — header (consecutivo: PO000, PO001, ...)
  supplyCompany: string; // Supply Company — header
  property?: string;     // Complejo al que pertenece el stock ("Hidden Creek Apartments")
  location?: string;     // Ubicación física ("0BLDG/SHOP")
  notes?: string;

  details?: EntranceDetail[];

  // Campos LEGACY (registros anteriores a la estructura header/detail).
  // En registros nuevos se rellenan a partir del primer detalle para compatibilidad.
  modelPart?: string;
  serial?: string;
  orderDate?: string;
  quantityOrdered?: number;
  itemsArrived?: number;
  itemName?: string;
}

/** ItemEntranceRecord con `details` garantizado (ya normalizado). */
export type NormalizedEntrance = ItemEntranceRecord & { details: EntranceDetail[] };

export type JobFormData = Omit<JobOrder, 'id' | 'createdBy' | 'seq' | 'visualSeq'>;
export type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
export type ItemEntranceFormData = Omit<ItemEntranceRecord, 'id' | 'seq' | 'visualSeq' | 'createdAt'>;

// =========================================
// Catálogos
// =========================================
export type FieldType = 'text' | 'number' | 'select';

export interface CatalogField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  /** Si es true, el campo no se muestra en la tabla (solo en el formulario). */
  hiddenInTable?: boolean;
}

export interface CatalogSchema {
  id: string;
  title: string;
  icon: ReactNode;
  fields: CatalogField[];
  /** Si es true, el catálogo admite importación masiva desde Excel/CSV. */
  importable?: boolean;
}

/** Registro genérico de catálogo. Los campos varían por catálogo (ver catalogsConfig). */
export interface CatalogRecord {
  id: string;
  seq?: number;
  visualSeq?: number;
  createdAt?: string;
  [field: string]: string | number | undefined;
}

/** Destino (unidad/dirección) — catálogo `catalog_destinations`. */
export interface Destination extends CatalogRecord {
  description: string;   // Dirección visible: "12 Mystyc Ct."
  property?: string;     // Complejo: "Hidden Creek Apartments"
  street?: string;       // "Mystyc Ct."
  unit?: number;         // 12
  contact?: string;
}

export interface SupplyCompany extends CatalogRecord {
  company: string;
  address?: string;
}

export interface ItemName extends CatalogRecord {
  item_name: string;
  category?: string;
}

/** Opción normalizada para selects (id = valor guardado, label = texto visible). */
export interface SelectOption {
  id: string;
  label: string;
}
