import { addDoc, arrayUnion, collection, doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
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

/**
 * Envía un mensaje y actualiza el resumen del chat: lastMessage, lectura propia y
 * el contador de no leídos de cada OTRO miembro (`unread.{email}` +1, estilo WhatsApp).
 */
export const sendChatMessage = async (chat: Pick<ChatConversation, 'id' | 'members'>, text: string, senderEmail: string, senderName: string): Promise<void> => {
  const at = new Date().toISOString();
  const sender = senderEmail.toLowerCase();
  await addDoc(collection(db, 'chats', chat.id, 'messages'), { text, senderEmail: sender, senderName, at, ts: serverTimestamp() });
  const update: Record<string, unknown> = {
    lastMessage: { text: text.slice(0, 200), senderEmail: sender, senderName, at },
    [`lastReadBy.${emailKey(sender)}`]: at,
    [`unread.${emailKey(sender)}`]: 0,
  };
  for (const m of chat.members) if (m !== sender) update[`unread.${emailKey(m)}`] = increment(1);
  await updateDoc(doc(db, 'chats', chat.id), update);
};

/** Marca el chat como leído por el usuario (y pone su contador en 0). */
export const markChatRead = async (chatId: string, email: string): Promise<void> => {
  await updateDoc(doc(db, 'chats', chatId), {
    [`lastReadBy.${emailKey(email)}`]: new Date().toISOString(),
    [`unread.${emailKey(email)}`]: 0,
  });
};

/** true si el chat tiene mensajes posteriores a la última lectura del usuario. */
export const hasUnread = (chat: ChatConversation, email: string): boolean => {
  if (!chat.lastMessage) return false;
  if (chat.lastMessage.senderEmail === email.toLowerCase()) return false;
  const readAt = chat.lastReadBy?.[emailKey(email)];
  return !readAt || readAt < chat.lastMessage.at;
};

/** Mensajes no leídos del usuario en un chat (contador real; fallback 1 para chats viejos). */
export const unreadCount = (chat: ChatConversation, email: string): number => {
  const n = chat.unread?.[emailKey(email)];
  if (typeof n === 'number') return n;
  return hasUnread(chat, email) ? 1 : 0;
};

/**
 * Doble check azul estilo WhatsApp: true si TODOS los demás miembros leyeron
 * el mensaje (su última lectura es posterior al envío).
 */
export const isReadByAll = (chat: ChatConversation, msgAt: string, senderEmail: string): boolean =>
  chat.members
    .filter(m => m !== senderEmail.toLowerCase())
    .every(m => { const r = chat.lastReadBy?.[emailKey(m)]; return !!r && r >= msgAt; });

/** Nombre a mostrar de un chat para un usuario (DM → el otro miembro). */
export const chatDisplayName = (chat: ChatConversation, myEmail: string): string => {
  if (chat.type === 'group') return chat.name || 'Group chat';
  const other = chat.members.find(m => m !== myEmail.toLowerCase());
  return (other && chat.memberNames[other]) || other || 'Direct message';
};

/** Borra un mensaje SOLO para este usuario (los demás miembros lo siguen viendo). */
export const deleteMessageForMe = async (chatId: string, messageId: string, email: string): Promise<void> => {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), { deletedFor: arrayUnion(emailKey(email)) });
};

/** true si este usuario borró el mensaje para sí. */
export const isDeletedForMe = (msg: { deletedFor?: string[] }, email: string): boolean =>
  (msg.deletedFor ?? []).includes(emailKey(email));

/** Heurística para dirección de traducción: true si el texto parece español. */
export const looksSpanish = (text: string): boolean => {
  if (/[áéíóúñü¿¡]/i.test(text)) return true;
  const es = (text.toLowerCase().match(/\b(el|la|los|las|que|de|del|por|para|con|sin|una|uno|unos|esta|este|esto|estoy|estas|estamos|es|son|soy|hay|muy|bien|mal|hola|gracias|buenos|buenas|dias|dia|manana|hoy|ayer|trabajo|ya|si|donde|cuando|como|hacer|hecho|necesito|puedo|puede|tengo|tiene|listo|nada|todo|pero|tambien|aqui|alla|rato|reviso|revisar|mensaje|prueba|nuevo|nueva|otro|otra|le|lo|les|nos|mi|tu|su|usted|ustedes|porque|entonces|ahora|luego|despues|antes|gusta|gustan|gustaria|quiero|quieres|quiere|vamos|voy|vas|va|dale|claro|perfecto|listo|hagamos|terminado|terminar|falta|faltan)\b/g) ?? []).length;
  const en = (text.toLowerCase().match(/\b(the|and|for|with|this|that|these|those|you|your|are|is|am|was|were|be|been|will|would|to|of|in|on|at|it|its|i|im|we|they|he|she|my|me|us|please|thanks|thank|work|working|done|need|needs|when|where|what|how|why|not|no|yes|ok|okay|still|today|tomorrow|yesterday|good|well|there|here|dealing|believe|message|test|new)\b/g) ?? []).length;
  return es >= en;
};

/** Normaliza para comparar si una "traducción" quedó casi igual al original. */
const normalizeForCompare = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

/** true si dos textos son prácticamente el mismo (traducción "de ida y vuelta" fallida). */
export const isSameText = (a: string, b: string): boolean => {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(na.split(' '));
  const wb = nb.split(' ');
  const common = wb.filter(w => wa.has(w)).length;
  return common / Math.max(wa.size, wb.length) >= 0.8;
};
