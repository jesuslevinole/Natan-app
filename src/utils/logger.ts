import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { LogEntry } from '../types';

/** Nombre del admin real mientras está "viendo como" otro usuario (modo prueba). */
let impersonator: string | null = null;

export const AuditLogger = {
  /** Marca (o limpia) el modo "view as": los logs quedan como "Usuario (test by Admin)". */
  setImpersonator(realName: string | null) {
    impersonator = realName;
  },

  async log(entry: Omit<LogEntry, 'timestamp'>) {
    try {
      const user = impersonator && entry.user !== impersonator ? `${entry.user} (test by ${impersonator})` : entry.user;
      const logData: LogEntry = { ...entry, user, timestamp: new Date().toISOString() };
      await addDoc(collection(db, 'system_logs'), logData);
    } catch (error) {
      console.error('CRITICAL: Audit log failed to write.', error);
    }
  },

  logLogin(username: string) {
    this.log({ action: 'LOGIN', module: 'Auth', user: username, details: 'User signed in successfully' });
  },

  logCreate(module: string, username: string, targetId: string, payload: unknown) {
    this.log({ action: 'CREATE', module, user: username, targetId, details: `Created new record in ${module}`, payload });
  },

  logUpdate(module: string, username: string, targetId: string, payload: unknown) {
    this.log({ action: 'UPDATE', module, user: username, targetId, details: `Updated record in ${module}`, payload });
  },

  logDelete(module: string, username: string, targetId: string, deletedData: unknown) {
    this.log({ action: 'DELETE', module, user: username, targetId, details: `Deleted record from ${module}`, payload: deletedData });
  },

  logImport(module: string, username: string, count: number, payload: unknown) {
    this.log({ action: 'IMPORT', module, user: username, details: `Imported ${count} records into ${module}`, payload });
  },
};
