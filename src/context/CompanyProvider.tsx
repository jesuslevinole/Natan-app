import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { CompanyContext, DEFAULT_COMPANY, type CompanySettings } from './companyContext';

const CACHE_KEY = 'natan_company';
export const COMPANY_DOC = ['settings', 'company'] as const;

const readCache = (): CompanySettings => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_COMPANY, ...(JSON.parse(raw) as Partial<CompanySettings>) } : DEFAULT_COMPANY;
  } catch {
    return DEFAULT_COMPANY;
  }
};

/**
 * Datos del negocio (nombre, logo, contacto) desde `settings/company`.
 * Se monta fuera del login: el logo debe verse en la pantalla de acceso. Si las reglas de
 * Firestore no permiten leer sin sesión, se usa la copia en localStorage guardada en la
 * última sesión y se vuelve a intentar cuando el usuario inicia sesión.
 */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<CompanySettings>(readCache);
  const [isReady, setIsReady] = useState(false);
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => onAuthStateChanged(auth, () => setAuthTick(t => t + 1)), []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, ...COMPANY_DOC),
      (snap) => {
        if (snap.exists()) {
          const data = { ...DEFAULT_COMPANY, ...(snap.data() as Partial<CompanySettings>) };
          setCompany(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        }
        setIsReady(true);
      },
      () => setIsReady(true), // sin permiso antes del login: nos quedamos con la caché
    );
    return () => unsubscribe();
  }, [authTick]);

  useEffect(() => {
    document.title = company.name ? `${company.name} App` : 'Mr Natan App';
  }, [company.name]);

  const value = useMemo(() => ({ company, isReady }), [company, isReady]);
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
