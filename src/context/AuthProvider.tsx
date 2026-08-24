import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { User, Role } from '../types';
import { AuthContext } from './authContext';
import { resolveSystemUser } from '../utils/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restaura la sesión al recargar la página (antes se perdía con cada refresh).
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const user = await resolveSystemUser(firebaseUser);
          if (user) {
            setCurrentUser(user);
          } else {
            await signOut(auth);
            setCurrentUser(null);
          }
        } else {
          // Sesión cerrada en Firebase: limpiamos salvo que sea el acceso de desarrollo (uid sintético).
          setCurrentUser(prev => (prev && prev.uid.startsWith('dev_') ? prev : null));
        }
      } catch (error) {
        console.error('Error restoring session:', error);
        setCurrentUser(null);
      } finally {
        setIsRestoring(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // El rol se escucha en tiempo real: si un admin cambia permisos, aplican sin re-login.
  useEffect(() => {
    if (!currentUser?.roleId) {
      setUserRole(null);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'roles', currentUser.roleId),
      (roleDoc) => {
        if (roleDoc.exists()) {
          setUserRole({ id: roleDoc.id, ...roleDoc.data() } as Role);
        } else if (currentUser.roleId === 'admin_role') {
          // Fallback para entornos sin la colección `roles` poblada.
          setUserRole({ id: 'admin_role', name: 'Super Admin', permissions: [] });
        } else {
          setUserRole(null);
        }
      },
      (error) => console.error('Error fetching role:', error),
    );
    return () => unsubscribe();
  }, [currentUser]);

  const login = useCallback((user: User) => setCurrentUser(user), []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    setUserRole(null);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  const hasPermission = useCallback((permission: string) => {
    if (!userRole) return false;
    if (userRole.name === 'Super Admin') return true;
    return userRole.permissions.includes(permission);
  }, [userRole]);

  const value = useMemo(
    () => ({ currentUser, userRole, isRestoring, login, logout, hasPermission }),
    [currentUser, userRole, isRestoring, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
