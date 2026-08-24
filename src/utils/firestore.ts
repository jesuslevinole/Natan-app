import { doc, runTransaction, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';

/** Convierte un snapshot de documento en `{ id, ...data }` tipado. */
export const docToRecord = <T>(d: QueryDocumentSnapshot<DocumentData>): T =>
  ({ ...d.data(), id: d.id }) as T;

/**
 * Obtiene el siguiente número de un contador atómico en `counters/{counterId}`.
 * `start` es el valor que recibe el primer registro (1 por defecto; 0 para los PO).
 * Antes esta transacción estaba copiada en 4 módulos.
 */
export const nextSequence = async (counterId: string, start = 1): Promise<number> => {
  const counterRef = doc(db, 'counters', counterId);
  return runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    if (counterDoc.exists()) {
      const current = counterDoc.data().value;
      const next = typeof current === 'number' ? current + 1 : start;
      transaction.update(counterRef, { value: next });
      return next;
    }
    transaction.set(counterRef, { value: start });
    return start;
  });
};

export const formatPONumber = (n: number) => `PO${String(n).padStart(3, '0')}`;

/**
 * Reserva un bloque de `count` números consecutivos en un contador (para importaciones
 * masivas). Devuelve el primer número del bloque.
 */
export const reserveSequenceBlock = async (counterId: string, count: number): Promise<number> => {
  const counterRef = doc(db, 'counters', counterId);
  return runTransaction(db, async (transaction) => {
    const counterDoc = await transaction.get(counterRef);
    const current = counterDoc.exists() && typeof counterDoc.data().value === 'number' ? counterDoc.data().value as number : 0;
    transaction.set(counterRef, { value: current + count });
    return current + 1;
  });
};

/** Límite de operaciones por WriteBatch en Firestore. */
export const BATCH_LIMIT = 450;
