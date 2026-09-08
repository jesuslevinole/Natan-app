import { collection, doc, getDocs, query, orderBy, deleteDoc, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AuditLogger } from './logger';
import type { TrashRecord } from '../types';

export interface TrashTarget {
  sourceCollection: string;
  sourceId: string;
  label: string;
  module: string;
  data: Record<string, unknown>;
  related?: Array<{ collection: string; id: string; data: Record<string, unknown> }>;
}

/**
 * Borrado suave: copia el documento (y sus relacionados) a `recycle_bin` con el motivo
 * y recién entonces borra los originales. Todo queda en Activity History.
 */
export const moveToTrash = async (target: TrashTarget, reason: string, deletedBy: string): Promise<void> => {
  const entry: Omit<TrashRecord, 'id'> = {
    sourceCollection: target.sourceCollection,
    sourceId: target.sourceId,
    label: target.label,
    module: target.module,
    data: target.data,
    related: target.related ?? [],
    deletedBy,
    deletedAt: new Date().toISOString(),
    reason: reason.trim(),
  };
  await addDoc(collection(db, 'recycle_bin'), entry);
  await deleteDoc(doc(db, target.sourceCollection, target.sourceId));
  for (const rel of target.related ?? []) {
    await deleteDoc(doc(db, rel.collection, rel.id));
  }
  AuditLogger.log({ action: 'DELETE', module: target.module, user: deletedBy, targetId: target.sourceId, details: `Moved to Recycle Bin: ${target.label}. Reason: ${entry.reason}`, payload: { reason: entry.reason } });
};

/** Restaura un registro de la papelera con su id original (y sus relacionados) y borra la entrada. */
export const restoreFromTrash = async (trash: TrashRecord, restoredBy: string): Promise<void> => {
  await setDoc(doc(db, trash.sourceCollection, trash.sourceId), trash.data);
  for (const rel of trash.related ?? []) {
    await setDoc(doc(db, rel.collection, rel.id), rel.data);
  }
  await deleteDoc(doc(db, 'recycle_bin', trash.id));
  AuditLogger.log({ action: 'RESTORE', module: trash.module, user: restoredBy, targetId: trash.sourceId, details: `Restored from Recycle Bin: ${trash.label}` });
};

/** Borra definitivamente una entrada de la papelera. */
export const purgeFromTrash = async (trash: TrashRecord, purgedBy: string): Promise<void> => {
  await deleteDoc(doc(db, 'recycle_bin', trash.id));
  AuditLogger.log({ action: 'PURGE', module: trash.module, user: purgedBy, targetId: trash.sourceId, details: `Deleted forever from Recycle Bin: ${trash.label}. Original reason: ${trash.reason}` });
};

/** Lectura puntual de la papelera (no hace falta suscripción en vivo). */
export const fetchTrash = async (): Promise<TrashRecord[]> => {
  const snap = await getDocs(query(collection(db, 'recycle_bin'), orderBy('deletedAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TrashRecord, 'id'>) }));
};
