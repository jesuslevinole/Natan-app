import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, Role } from '../types';

interface AuthContextProps {
  currentUser: User | null;
  userRole: Role | null;
  login: (user: User) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (currentUser?.roleId) {
        try {
          const roleDoc = await getDoc(doc(db, 'roles', currentUser.roleId));
          if (roleDoc.exists()) {
            setUserRole({ id: roleDoc.id, ...roleDoc.data() } as Role);
          } else {
            // Fallback role for testing if DB is not populated
            if (currentUser.roleId === 'admin_role') {
               setUserRole({ id: 'admin_role', name: 'Super Admin', permissions: [] });
            }
          }
        } catch (error) {
          console.error("Error fetching role:", error);
        }
      } else {
        setUserRole(null);
      }
    };
    fetchRole();
  }, [currentUser]);

  const login = (user: User) => setCurrentUser(user);
  
  const logout = () => { 
    setCurrentUser(null); 
    setUserRole(null); 
  };

  const hasPermission = (permission: string) => {
    if (!userRole) return false;
    if (userRole.name === 'Super Admin') return true;
    return userRole.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userRole, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const RequirePermission: React.FC<{ permission: string, children: React.ReactNode }> = ({ permission, children }) => {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return null;
  return <>{children}</>;
};