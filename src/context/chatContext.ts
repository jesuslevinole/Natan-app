import { createContext } from 'react';
import type { ChatConversation } from '../types';

export interface ChatContextProps {
  /** Conversaciones del usuario actual, ordenadas por actividad (más reciente primero). */
  chats: ChatConversation[];
  /** null mientras carga la primera vez. */
  isLoading: boolean;
  /** Total de mensajes sin leer en todos los chats. */
  unreadTotal: number;
  loadError: string;
}

export const ChatContext = createContext<ChatContextProps>({ chats: [], isLoading: true, unreadTotal: 0, loadError: '' });
