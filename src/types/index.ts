import { ReactNode } from 'react';

export interface User { username: string; role: 'admin' | 'user'; }

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
  modelPart: string;
  serial: string; 
  po: string; 
  quantity: number; 
  itemName: string;
}

export interface ItemEntranceRecord {
  id: string; 
  seq?: number; 
  visualSeq?: number; 
  createdAt?: string; 
  date: string; 
  modelPart: string; 
  serial: string; 
  po: string;
  orderDate: string; 
  quantityOrdered: number; 
  itemsArrived: number; 
  supplyCompany: string; 
  itemName: string;
}

export type JobFormData = Omit<JobOrder, 'id' | 'createdBy' | 'seq' | 'visualSeq'>;
export type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
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