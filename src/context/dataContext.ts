import { createContext } from 'react';
import type { JobOrder, JobProduct, NormalizedEntrance, Role, SystemUser, Destination, SupplyCompany, ItemName } from '../types';

export interface AppData {
  /** Órdenes ordenadas DESC (más reciente arriba) con visualSeq contiguo asignado. */
  jobOrders: JobOrder[];
  jobProducts: JobProduct[];
  /** POs normalizados (siempre con `details`), ordenados DESC. */
  entrances: NormalizedEntrance[];
  /** Consumo por detailId (derivado de jobProducts). */
  usage: Map<string, number>;
  roles: Role[];
  users: SystemUser[];
  destinations: Destination[];
  supplyCompanies: SupplyCompany[];
  itemNames: ItemName[];
  /** true hasta que todas las colecciones entregaron su primer snapshot. */
  isLoading: boolean;
}

export const DataContext = createContext<AppData | undefined>(undefined);
