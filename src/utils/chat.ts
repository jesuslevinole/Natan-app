import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ChatConversation } from '../types';

/** Firestore no admite '.' en claves de mapa: email → clave segura. */
export const emailKey = (email: string): string => email.toLowerCase().replace(/\./g, ',');

/** Id determinístico para un DM (mismo par de emails → mismo chat, sin duplicados). */
export const dmChatId = (a: string, b: string): string =>
  `dm_${[a, b].map(e => e.toLowerCase()).sort().join('__').replace(/[^a-z0-9@_-]/g, '-')}`;

export interface NewChatInput {
  type: 'dm' | 'group';
  name?: string;
  members: string[]; // emails en minúsculas, incluye al creador
  memberNames: Record<string, string>;
  createdBy: string; // email
}

/** Crea (o asegura) una conversación. Para DM usa id determinístico con merge. */
export const ensureConversation = async (input: NewChatInput): Promise<string> => {
  const base = {
    type: input.type,
    name: input.name ?? '',
    members: input.members,
    memberNames: input.memberNames,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  if (input.type === 'dm') {
    const id = dmChatId(input.members[0], input.members[1]);
    await setDoc(doc(db, 'chats', id), base, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(db, 'chats'), base);
  return ref.id;
};

/** Envía un mensaje y actualiza el resumen del chat (lastMessage + lectura propia). */
export const sendChatMessage = async (chatId: string, text: string, senderEmail: string, senderName: string): Promise<void> => {
  const at = new Date().toISOString();
  await addDoc(collection(db, 'chats', chatId, 'messages'), { text, senderEmail: senderEmail.toLowerCase(), senderName, at, ts: serverTimestamp() });
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: { text: text.slice(0, 200), senderEmail: senderEmail.toLowerCase(), senderName, at },
    [`lastReadBy.${emailKey(senderEmail)}`]: at,
  });
};

/** Marca el chat como leído por el usuario. */
export const markChatRead = async (chatId: string, email: string): Promise<void> => {
  await updateDoc(doc(db, 'chats', chatId), { [`lastReadBy.${emailKey(email)}`]: new Date().toISOString() });
};

/** true si el chat tiene mensajes posteriores a la última lectura del usuario. */
export const hasUnread = (chat: ChatConversation, email: string): boolean => {
  if (!chat.lastMessage) return false;
  if (chat.lastMessage.senderEmail === email.toLowerCase()) return false;
  const readAt = chat.lastReadBy?.[emailKey(email)];
  return !readAt || readAt < chat.lastMessage.at;
};

/** Nombre a mostrar de un chat para un usuario (DM → el otro miembro). */
export const chatDisplayName = (chat: ChatConversation, myEmail: string): string => {
  if (chat.type === 'group') return chat.name || 'Group chat';
  const other = chat.members.find(m => m !== myEmail.toLowerCase());
  return (other && chat.memberNames[other]) || other || 'Direct message';
};
