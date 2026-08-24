import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataContext, type AppData } from './dataContext';
import { collection, onSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type {
  JobOrder, JobProduct, ItemEntranceRecord, Role, SystemUser,
  Destination, SupplyCompany, ItemName, CatalogRecord,
} from '../types';
import { normalizeEntrance, buildUsageMap } from '../utils/entrance';
import { docToRecord } from '../utils/firestore';

/**
 * Fuente única de datos en tiempo real para toda la app.
 *
 * Antes cada módulo hacía sus propios `getDocs` al montar (Work Activity bajaba 5
 * colecciones, Item Entrance 4, Reports 4...) y volvía a bajar TODO después de cada
 * guardado. Al cambiar de módulo se repetía la descarga completa. Ahora hay un solo
 * listener por colección, compartido, que se abre al iniciar sesión y solo recibe deltas.
 */


const byCreatedDesc = <T extends { createdAt?: string; date?: string }>(a: T, b: T) =>
  new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime();

const byCreatedAsc = <T extends { createdAt?: string }>(a: T, b: T) =>
  new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();

const COLLECTIONS = [
  'jobOrders', 'jobProducts', 'itemEntrance', 'roles', 'users',
  'catalog_destinations', 'catalog_supply_companies', 'catalog_item_names',
] as const;
type CollectionName = typeof COLLECTIONS[number];

export function DataProvider({ children }: { children: ReactNode }) {
  const [rawJobOrders, setRawJobOrders] = useState<JobOrder[]>([]);
  const [jobProducts, setJobProducts] = useState<JobProduct[]>([]);
  const [rawEntrances, setRawEntrances] = useState<ItemEntranceRecord[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [rawDestinations, setRawDestinations] = useState<Destination[]>([]);
  const [rawSupplyCompanies, setRawSupplyCompanies] = useState<SupplyCompany[]>([]);
  const [rawItemNames, setRawItemNames] = useState<ItemName[]>([]);
  const [loaded, setLoaded] = useState<Set<CollectionName>>(new Set());

  useEffect(() => {
    const markLoaded = (name: CollectionName) =>
      setLoaded(prev => (prev.has(name) ? prev : new Set(prev).add(name)));

    const subscribe = <T,>(name: CollectionName, setter: (rows: T[]) => void) =>
      onSnapshot(
        collection(db, name),
        (snap: QuerySnapshot<DocumentData>) => {
          setter(snap.docs.map(d => docToRecord<T>(d)));
          markLoaded(name);
        },
        (error) => {
          // Un error de permisos en una colección no debe tumbar toda la app.
          console.error(`Error listening to ${name}:`, error);
          markLoaded(name);
        },
      );

    const unsubs = [
      subscribe<JobOrder>('jobOrders', setRawJobOrders),
      subscribe<JobProduct>('jobProducts', setJobProducts),
      subscribe<ItemEntranceRecord>('itemEntrance', setRawEntrances),
      subscribe<Role>('roles', setRoles),
      subscribe<SystemUser>('users', setUsers),
      subscribe<Destination>('catalog_destinations', setRawDestinations),
      subscribe<SupplyCompany>('catalog_supply_companies', setRawSupplyCompanies),
      subscribe<ItemName>('catalog_item_names', setRawItemNames),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // visualSeq contiguo: el más viejo = 1. Garantiza numeración sin saltos aunque
  // registros antiguos no tengan `seq` persistido.
  const jobOrders = useMemo(() => {
    const asc = [...rawJobOrders].sort(byCreatedAsc);
    return asc.map((o, idx) => ({ ...o, visualSeq: idx + 1 })).reverse();
  }, [rawJobOrders]);

  const entrances = useMemo(() => {
    const sorted = [...rawEntrances].sort(byCreatedDesc);
    const total = sorted.length;
    return sorted.map((e, idx) => normalizeEntrance({ ...e, visualSeq: e.seq || total - idx }));
  }, [rawEntrances]);

  const usage = useMemo(() => buildUsageMap(jobProducts), [jobProducts]);

  const sortCatalog = <T extends CatalogRecord>(rows: T[], labelField: keyof T): T[] =>
    [...rows].sort((a, b) => String(a[labelField] || '').localeCompare(String(b[labelField] || ''), undefined, { numeric: true }));

  const destinations = useMemo(() => sortCatalog(rawDestinations, 'description'), [rawDestinations]);
  const supplyCompanies = useMemo(() => sortCatalog(rawSupplyCompanies, 'company'), [rawSupplyCompanies]);
  const itemNames = useMemo(() => sortCatalog(rawItemNames, 'item_name'), [rawItemNames]);

  const isLoading = loaded.size < COLLECTIONS.length;

  const value = useMemo<AppData>(
    () => ({ jobOrders, jobProducts, entrances, usage, roles, users, destinations, supplyCompanies, itemNames, isLoading }),
    [jobOrders, jobProducts, entrances, usage, roles, users, destinations, supplyCompanies, itemNames, isLoading],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
