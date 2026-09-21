import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { User, Role } from '../types';
import { AuthContext } from './authContext';
import { resolveSystemUser, isOwnerEmail, SUPER_ADMIN_ROLE } from '../utils/auth';
import { displayName } from '../utils/helpers';
import { permissionSatisfied } from '../utils/permissions';
import { AuditLogger } from '../utils/logger';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  // Modo "view as": el admin ve la app como otro usuario, con el rol de ese usuario.
  const [viewAsUser, setViewAsUser] = useState<User | null>(null);
  const [viewAsRole, setViewAsRole] = useState<Role | null>(null);

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
    if (!currentUser) {
      setUserRole(null);
      return;
    }
    if (isOwnerEmail(currentUser.email)) {
      setUserRole(SUPER_ADMIN_ROLE);
      return;
    }
    if (!currentUser.roleId) {
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
          setUserRole(SUPER_ADMIN_ROLE);
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
    // En modo prueba, "Log Out" primero devuelve al admin real (no cierra su sesión).
    if (viewAsUser) {
      AuditLogger.setImpersonator(null);
      setViewAsUser(null);
      setViewAsRole(null);
      return;
    }
    if (currentUser) AuditLogger.log({ action: 'LOGOUT', module: 'Auth', user: currentUser.username, details: 'User signed out' });
    setCurrentUser(null);
    setUserRole(null);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [currentUser, viewAsUser]);

  const effectiveRole = viewAsUser ? viewAsRole : userRole;

  const hasPermission = useCallback((permission: string) => {
    if (!effectiveRole) return false;
    if (effectiveRole.name === 'Super Admin') return true;
    return permissionSatisfied(permission, effectiveRole.permissions);
  }, [effectiveRole]);

  const startImpersonation = useCallback((user: User, role: Role | null) => {
    if (!currentUser || !userRole) return;
    // Solo un admin real con el permiso puede entrar en modo prueba.
    const allowed = userRole.name === 'Super Admin' || permissionSatisfied('impersonate_users', userRole.permissions);
    if (!allowed || user.email.toLowerCase() === currentUser.email.toLowerCase()) return;
    const realName = displayName(currentUser, currentUser.username);
    setViewAsUser(user);
    setViewAsRole(isOwnerEmail(user.email) ? SUPER_ADMIN_ROLE : role);
    AuditLogger.setImpersonator(realName);
    AuditLogger.log({ action: 'LOGIN', module: 'Auth', user: realName, details: `Test mode: started viewing the app as ${displayName(user, user.username)} (${(isOwnerEmail(user.email) ? SUPER_ADMIN_ROLE : role)?.name ?? 'no role'})` });
  }, [currentUser, userRole]);

  const stopImpersonation = useCallback(() => {
    if (!currentUser || !viewAsUser) return;
    const realName = displayName(currentUser, currentUser.username);
    AuditLogger.setImpersonator(null);
    AuditLogger.log({ action: 'LOGOUT', module: 'Auth', user: realName, details: `Test mode: stopped viewing the app as ${displayName(viewAsUser, viewAsUser.username)}` });
    setViewAsUser(null);
    setViewAsRole(null);
  }, [currentUser, viewAsUser]);

  const value = useMemo(
    () => ({
      currentUser: viewAsUser ?? currentUser,
      userRole: effectiveRole,
      isRestoring,
      login,
      logout,
      hasPermission,
      realUser: currentUser,
      isImpersonating: viewAsUser !== null,
      startImpersonation,
      stopImpersonation,
    }),
    [currentUser, viewAsUser, effectiveRole, isRestoring, login, logout, hasPermission, startImpersonation, stopImpersonation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
