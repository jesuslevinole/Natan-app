import { createContext } from 'react';
import type { User, Role } from '../types';

export interface AuthContextProps {
  currentUser: User | null;
  userRole: Role | null;
  /** true mientras Firebase Auth restaura la sesión al abrir la app. */
  isRestoring: boolean;
  /** Login manual (solo usado por el acceso de desarrollo). El login real lo maneja onAuthStateChanged. */
  login: (user: User) => void;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

export const AuthContext = createContext<AuthContextProps | undefined>(undefined);
