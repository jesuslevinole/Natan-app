import type { EntranceDetail, ItemEntranceRecord, JobProduct, NormalizedEntrance } from '../types';

/**
 * Normaliza un documento de `itemEntrance`: si es un registro legacy (sin `details`),
 * construye un detalle único usando el id del doc como detailId.
 * Antes esta lógica estaba copiada en 3 módulos con pequeñas diferencias.
 */
export const normalizeEntrance = (raw: ItemEntranceRecord): NormalizedEntrance => {
  if (Array.isArray(raw.details) && raw.details.length > 0) {
    return raw as NormalizedEntrance;
  }
  const legacyDetail: EntranceDetail = {
    detailId: raw.id,
    itemName: raw.itemName || '',
    modelPart: raw.modelPart || '',
    serial: raw.serial || '',
    orderDate: raw.orderDate || '',
    itemsArrived: raw.itemsArrived || 0,
  };
  return { ...raw, details: [legacyDetail] };
};

/**
 * Consumo por detalle: Map<detailId, cantidad usada>.
 * Un JobProduct nuevo apunta a `entranceDetailId`; uno legacy solo tiene `itemEntranceId`,
 * y en ese caso el detalle legacy tiene detailId === entranceId, así que ambos caminos
 * caen en la misma clave.
 */
export const buildUsageMap = (products: JobProduct[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const p of products) {
    const key = p.entranceDetailId || p.itemEntranceId;
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(p.quantity) || 0));
  }
  return map;
};

export const getDetailStock = (detail: EntranceDetail, usage: Map<string, number>): number =>
  (Number(detail.itemsArrived) || 0) - (usage.get(detail.detailId) || 0);

export interface EntranceStock { stock: number; total: number }

export const getEntranceStock = (entrance: NormalizedEntrance, usage: Map<string, number>): EntranceStock => {
  let total = 0;
  let stock = 0;
  for (const d of entrance.details) {
    total += Number(d.itemsArrived) || 0;
    stock += getDetailStock(d, usage);
  }
  return { stock, total };
};

/** Opción "aplanada" de un detalle con su PO padre (para selects de productos). */
export interface FlatDetailOption {
  entranceId: string;
  detailId: string;
  composedId: string; // `${entranceId}::${detailId}`
  itemName: string;
  modelPart: string;
  serial: string;
  po: string;
  itemsArrived: number;
}

export const flattenEntrances = (entrances: NormalizedEntrance[]): FlatDetailOption[] =>
  entrances.flatMap(e =>
    e.details.map(d => ({
      entranceId: e.id,
      detailId: d.detailId,
      composedId: `${e.id}::${d.detailId}`,
      itemName: d.itemName,
      modelPart: d.modelPart,
      serial: d.serial,
      po: e.po || '',
      itemsArrived: d.itemsArrived || 0,
    })),
  );

/** Valor del stock disponible de un PO (stock restante × precio unitario de cada detalle). */
export const entranceStockValue = (entrance: NormalizedEntrance, usage: Map<string, number>): number =>
  entrance.details.reduce((sum, d) => sum + Math.max(0, getDetailStock(d, usage)) * (d.price ?? 0), 0);
