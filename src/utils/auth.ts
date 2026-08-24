import type { User as FirebaseUser } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { User, SystemUser } from '../types';
import { displayName } from './helpers';

/**
 * Resuelve el usuario de Firebase Auth contra la colección `users` (usuarios autorizados
 * por un administrador). Devuelve null si el email no está autorizado.
 */
export const resolveSystemUser = async (firebaseUser: FirebaseUser): Promise<User | null> => {
  const email = (firebaseUser.email || '').trim().toLowerCase();
  if (!email) return null;
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (snap.empty) return null;
  const data = snap.docs[0].data() as SystemUser;
  return {
    uid: firebaseUser.uid,
    username: displayName(data, email.split('@')[0]),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    roleId: data.roleId,
  };
};
