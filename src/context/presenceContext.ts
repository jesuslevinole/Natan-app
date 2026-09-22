import { createContext } from 'react';
import type { PresenceRecord } from '../types';

export interface PresenceContextProps {
  /** email (minúsculas) → registro de presencia. */
  presence: Map<string, PresenceRecord>;
  /** true si el usuario dio señales de vida hace menos de 2 minutos. */
  isOnline: (email: string) => boolean;
}

export const PresenceContext = createContext<PresenceContextProps>({ presence: new Map(), isOnline: () => false });
