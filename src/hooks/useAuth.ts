import { useContext } from 'react';
import { AuthContext } from '../context/authContext';
import { displayName } from '../utils/helpers';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

/** Nombre del usuario actual para auditoría ("Nombre Apellido" o username). */
export const useAuthorName = (): string => {
  const { currentUser } = useAuth();
  return currentUser ? displayName(currentUser, currentUser.username) : 'Unknown User';
};
