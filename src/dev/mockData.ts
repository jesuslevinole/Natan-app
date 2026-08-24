import type { AppData } from '../context/dataContext';
import type { JobOrder, JobProduct, NormalizedEntrance, Destination, Role, SystemUser, EntranceDetail } from '../types';
import { buildUsageMap } from '../utils/entrance';

/**
 * Datos de ejemplo para la vista previa de diseño (/preview.html). No se usan en producción.
 * Generados con una semilla fija para que la maqueta sea siempre igual.
 */
let seed = 7;
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const streets = ['Overview Ct.', 'Staysail Ct.', 'Galleon Ct.', 'Mystyc Ct.', 'Silver Ct.', 'Leeward Ct.', 'Bove Ln.'];
export const mockDestinations: Destination[] = Array.from({ length: 40 }, (_, i) => {
  const street = streets[i % streets.length];
  const unit = 2 + i * 3;
  return { id: `d${i}`, seq: i + 1, visualSeq: i + 1, description: `${unit} ${street}`, street, unit, property: street === 'Bove Ln.' ? 'Lakehurst Park Apartments' : 'Hidden Creek Apartments' };
});

const techs = ['Jose Cruz', 'Jesus Molero', 'Iglesia Barnegat', ''];
const orderedBy = ['Jose Cruz', 'Admin Temporal', 'Jesus Molero'];
const tasks = ['Replace bathroom faucet', 'Fix front door lock', 'AC not cooling — check capacitor', 'Repaint living room wall', 'Water heater leaking', 'Replace garbage disposal', 'Patch drywall in bedroom', 'Replace smoke detector batteries'];
const notes = ['', '', 'Tenant not home, reschedule.', 'Needs part from supplier — ETA next week.', 'Waiting for manager approval on additional work.', ''];

export const mockOrders: JobOrder[] = Array.from({ length: 64 }, (_, i) => {
  const created = daysAgo(Math.floor(rand() * 180));
  const finished = rand() < 0.65;
  const offset = Math.floor(rand() * 40) - 10;
  const sched = new Date(created); sched.setDate(sched.getDate() + Math.max(0, offset));
  return {
    id: `o${i}`, seq: i + 1, visualSeq: i + 1,
    jobOrder: pick(orderedBy), madeBy: pick(techs),
    destination: pick(mockDestinations).description,
    description: pick(tasks),
    workFinish: (finished ? 'YES' : 'NO') as JobOrder['workFinish'],
    pendingWork: finished ? '' : pick(notes),
    schedule: rand() < 0.85 ? iso(sched) : '',
    createdBy: 'seed', createdAt: created,
  };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o, i, arr) => ({ ...o, visualSeq: arr.length - i }));

const items = [['Bathroom Faucet', 'MOEN-8412'], ['Door Lock Set', 'KW-660'], ['AC Capacitor 45/5', 'CAP-455'], ['Smoke Detector', 'KID-9120'], ['Garbage Disposal 1/2HP', 'ISE-BADGER5'], ['Water Heater Element', 'WH-4500'], ['Interior Paint 1gal', 'SW-7008']];
const suppliers = ['Home Depot', 'Lowe\'s', 'Ferguson', 'Grainger'];
export const mockEntrances: NormalizedEntrance[] = Array.from({ length: 14 }, (_, i) => {
  const date = daysAgo(Math.floor(rand() * 160));
  const details: EntranceDetail[] = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, j) => {
    const [itemName, modelPart] = pick(items);
    return { detailId: `e${i}-${j}`, itemName, modelPart, serial: rand() < 0.5 ? `SN${1000 + i * 10 + j}` : '', orderDate: date, itemsArrived: 1 + Math.floor(rand() * 8) };
  });
  return { id: `e${i}`, seq: i + 1, visualSeq: i + 1, createdAt: date, date, po: `PO${String(i + 1).padStart(3, '0')}`, supplyCompany: pick(suppliers), details };
}).sort((a, b) => b.po.localeCompare(a.po));

export const mockProducts: JobProduct[] = [];
const remaining = new Map(mockEntrances.flatMap(e => e.details.map(d => [d.detailId, d.itemsArrived] as const)));
for (const o of mockOrders) {
  if (rand() < 0.5) continue;
  const e = pick(mockEntrances); const d = pick(e.details);
  const left = remaining.get(d.detailId) ?? 0;
  if (left <= 0) continue;
  const quantity = Math.min(left, 1 + Math.floor(rand() * 2));
  remaining.set(d.detailId, left - quantity);
  mockProducts.push({ id: `p${mockProducts.length}`, jobOrderId: o.id, itemEntranceId: e.id, entranceDetailId: d.detailId, modelPart: d.modelPart, serial: d.serial, po: e.po, quantity, itemName: d.itemName });
}

export const mockRoles: Role[] = [
  { id: 'admin_role', name: 'Super Admin', permissions: [] },
  { id: 'tech', name: 'Technician', permissions: ['view_work_activity', 'edit_work_activity', 'view_item_entrance'] },
];
export const mockUsers: SystemUser[] = [
  { id: 'u1', firstName: 'Jesus', lastName: 'Molero', email: 'jesus@example.com', roleId: 'admin_role', status: 'Active', createdAt: daysAgo(200) },
  { id: 'u2', firstName: 'Jose', lastName: 'Cruz', email: 'jose@example.com', roleId: 'tech', status: 'Active', createdAt: daysAgo(90) },
  { id: 'u3', firstName: '', lastName: '', email: 'new.tech@example.com', roleId: 'tech', status: 'Pending', createdAt: daysAgo(3) },
];

export const mockAppData: AppData = {
  jobOrders: mockOrders,
  jobProducts: mockProducts,
  entrances: mockEntrances,
  usage: buildUsageMap(mockProducts),
  roles: mockRoles,
  users: mockUsers,
  destinations: mockDestinations,
  supplyCompanies: suppliers.map((s, i) => ({ id: `s${i}`, seq: i + 1, visualSeq: i + 1, company: s })),
  itemNames: items.map(([n], i) => ({ id: `i${i}`, seq: i + 1, visualSeq: i + 1, item_name: n })),
  isLoading: false,
};
