import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { emailKey } from '../utils/chat';
import { displayName } from '../utils/helpers';
import { PresenceContext } from './presenceContext';
import type { PresenceRecord } from '../types';

const HEARTBEAT_MS = 60_000;
const ONLINE_WINDOW_MS = 2 * 60_000;

/**
 * Presencia: mientras la app está abierta, cada usuario "late" (colección `presence`,
 * un doc por email) y todos se suscriben para saber quién está conectado y cuándo
 * fue la última vez que alguien abrió el app. Online = latido hace < 2 minutos.
 * En modo "view as" se registra la presencia del ADMIN REAL, no la del impersonado.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const myEmail = (realUser?.email || '').toLowerCase();
  const myName = realUser ? displayName(realUser, realUser.username) : '';
  const [presence, setPresence] = useState<Map<string, PresenceRecord>>(new Map());
  // Reloj para reevaluar quién sigue online sin nuevos snapshots.
  const [, setTick] = useState(0);

  // Mi latido: al abrir, cada minuto y al volver a la pestaña.
  useEffect(() => {
    if (!myEmail) return;
    const beat = () => {
      setDoc(doc(db, 'presence', emailKey(myEmail)), {
        email: myEmail, name: myName, lastSeenAt: new Date().toISOString(),
      }, { merge: true }).catch(() => undefined);
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [myEmail, myName]);

  // Presencia de todos, en vivo.
  useEffect(() => {
    if (!myEmail) { setPresence(new Map()); return; }
    const unsub = onSnapshot(collection(db, 'presence'), snap => {
      const map = new Map<string, PresenceRecord>();
      snap.docs.forEach(d => { const r = d.data() as PresenceRecord; if (r.email) map.set(r.email.toLowerCase(), r); });
      setPresence(map);
    }, err => console.error('Presence subscription failed', err));
    return () => unsub();
  }, [myEmail]);

  // Re-render periódico para que "Online" caduque solo.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo(() => ({
    presence,
    isOnline: (email: string) => {
      const r = presence.get(email.toLowerCase());
      return !!r && Date.now() - new Date(r.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
    },
  }), [presence]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}
