import { createContext } from 'react';

export interface CompanySettings {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Logo como data URL (PNG/JPEG redimensionado en el cliente, máx. ~150 KB). */
  logo: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: 'Mr Natan', tagline: 'Secure System Login', address: '', phone: '', email: '', website: '', logo: '',
};

export interface CompanyContextValue {
  company: CompanySettings;
  /** true cuando ya se leyó Firestore al menos una vez (o falló y se usa la caché). */
  isReady: boolean;
}

export const CompanyContext = createContext<CompanyContextValue>({ company: DEFAULT_COMPANY, isReady: false });
