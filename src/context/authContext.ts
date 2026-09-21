import { createContext } from 'react';
import type { User, Role } from '../types';

export interface AuthContextProps {
  /** Usuario efectivo: el real, o el impersonado durante "view as". */
  currentUser: User | null;
  userRole: Role | null;
  /** true mientras Firebase Auth restaura la sesión al abrir la app. */
  isRestoring: boolean;
  /** Login manual (solo usado por el acceso de desarrollo). El login real lo maneja onAuthStateChanged. */
  login: (user: User) => void;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  /** Admin real detrás de la sesión (difiere de currentUser durante "view as"). */
  realUser: User | null;
  isImpersonating: boolean;
  /** Empieza a ver la app como otro usuario, con el rol completo de ese usuario. */
  startImpersonation: (user: User, role: Role | null) => void;
  stopImpersonation: () => void;
}

export const AuthContext = createContext<AuthContextProps | undefined>(undefined);
