import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { unreadCount } from '../utils/chat';
import { ChatContext } from './chatContext';
import type { ChatConversation } from '../types';

/**
 * Suscripción global al chat: alimenta el badge del menú, el botón flotante y el
 * módulo. Además hace un "pop" sonoro y actualiza el título de la pestaña cuando
 * llegan mensajes nuevos (estilo WhatsApp Web).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const myEmail = (currentUser?.email || '').toLowerCase();
  const [chats, setChats] = useState<ChatConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!myEmail) { setChats([]); setIsLoading(false); return; }
    setIsLoading(true);
    const q = query(collection(db, 'chats'), where('members', 'array-contains', myEmail));
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ChatConversation, 'id'>) }));
      rows.sort((a, b) => (b.lastMessage?.at || b.createdAt || '').localeCompare(a.lastMessage?.at || a.createdAt || ''));
      setChats(rows);
      setIsLoading(false);
      setLoadError('');
    }, err => {
      console.error('Chat subscription failed', err);
      setChats([]);
      setIsLoading(false);
      setLoadError('Could not load conversations. Check the Firestore rules for the "chats" collection.');
    });
    return () => unsub();
  }, [myEmail]);

  const unreadTotal = useMemo(
    () => chats.reduce((sum, c) => sum + unreadCount(c, myEmail), 0),
    [chats, myEmail],
  );

  // "Pop" cuando el total de no leídos sube (mensaje nuevo recibido).
  const prevUnread = useRef(0);
  useEffect(() => {
    if (unreadTotal > prevUnread.current) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
          osc.onended = () => { ctx.close().catch(() => undefined); };
        }
      } catch { /* sin audio (autoplay bloqueado): no pasa nada */ }
    }
    prevUnread.current = unreadTotal;
  }, [unreadTotal]);

  // Contador en el título de la pestaña: "(3) EZ Maintenance".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = unreadTotal > 0 ? `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${base}` : base;
  }, [unreadTotal]);

  const value = useMemo(() => ({ chats, isLoading, unreadTotal, loadError }), [chats, isLoading, unreadTotal, loadError]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
