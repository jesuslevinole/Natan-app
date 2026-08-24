import { useMemo } from 'react';
import { LayoutDashboard, Briefcase, CalendarClock, AlertTriangle, PackageSearch, Boxes, MapPin, ArrowRight } from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import { useAuth } from '../hooks/useAuth';
import { getDetailStock } from '../utils/entrance';
import { formatDateDisplay, getTodayString } from '../utils/helpers';
import KpiCard from '../components/KpiCard';
import LoadingScreen from '../components/LoadingScreen';
import SeqBadge from '../components/SeqBadge';
import type { ModuleId } from '../App';
import './DashboardModule.css';

interface Props {
  onNavigate: (module: ModuleId) => void;
}

const LOW_STOCK_THRESHOLD = 2;

/**
 * Pantalla de inicio: resumen operativo del día. Todo sale de DataProvider (sin fetch propio).
 */
export default function DashboardModule({ onNavigate }: Props) {
  const { jobOrders, entrances, usage, destinations, isLoading } = useAppData();
  const { currentUser, hasPermission } = useAuth();
  const today = getTodayString();

  const stats = useMemo(() => {
    const active = jobOrders.filter(o => o.workFinish === 'NO');
    const overdue = active.filter(o => o.schedule && o.schedule < today);
    const dueToday = active.filter(o => o.schedule === today);
    const upcoming = active
      .filter(o => o.schedule && o.schedule >= today)
      .sort((a, b) => a.schedule.localeCompare(b.schedule))
      .slice(0, 8);
    const finishedThisMonth = jobOrders.filter(o => o.workFinish === 'YES' && (o.createdAt || '').startsWith(today.slice(0, 7))).length;

    let stockAvailable = 0;
    const lowStock: Array<{ po: string; itemName: string; modelPart: string; stock: number; total: number }> = [];
    for (const e of entrances) {
      for (const d of e.details) {
        const stock = getDetailStock(d, usage);
        if (stock > 0) stockAvailable += stock;
        if (stock <= LOW_STOCK_THRESHOLD) {
          lowStock.push({ po: e.po, itemName: d.itemName, modelPart: d.modelPart, stock, total: d.itemsArrived });
        }
      }
    }
    lowStock.sort((a, b) => a.stock - b.stock);

    const properties = new Set(destinations.map(d => d.property).filter(Boolean)).size;

    return { active, overdue, dueToday, upcoming, finishedThisMonth, stockAvailable, lowStock, properties };
  }, [jobOrders, entrances, usage, destinations, today]);

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />;

  const canWork = hasPermission('view_work_activity');
  const canStock = hasPermission('view_item_entrance');

  return (
    <div className="card max-1400 catalog-manager-anim">
      <div className="card-header wrap">
        <div className="card-header-text module-header-title">
          <h2><LayoutDashboard size={28} /> Dashboard</h2>
          <p>Welcome back, {currentUser?.firstName || currentUser?.username}. Here is today&apos;s overview ({formatDateDisplay(today)}).</p>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon={<Briefcase size={24} />} label="Active Orders" value={stats.active.length} tone="blue" onClick={canWork ? () => onNavigate('workActivity') : undefined} />
        <KpiCard icon={<CalendarClock size={24} />} label="Due Today" value={stats.dueToday.length} tone="purple" note={`${stats.finishedThisMonth} finished this month`} />
        <KpiCard icon={<AlertTriangle size={24} />} label="Overdue" value={stats.overdue.length} tone={stats.overdue.length > 0 ? 'red' : 'green'} note="Scheduled before today, not finished" />
        <KpiCard icon={<Boxes size={24} />} label="Units in Stock" value={stats.stockAvailable} tone="green" note={`${stats.lowStock.length} product(s) low or out of stock`} onClick={canStock ? () => onNavigate('itemEntrance') : undefined} />
        <KpiCard icon={<MapPin size={24} />} label="Addresses" value={destinations.length} tone="slate" note={`${stats.properties} propert${stats.properties === 1 ? 'y' : 'ies'}`} />
      </div>

      <div className="panel-grid">
        <div className="panel h-400">
          <div className="panel-header">
            <span className="panel-icon"><CalendarClock size={20} /></span>
            <div className="flex-1">
              <h4>Upcoming &amp; Overdue Work</h4>
              <p>Active orders sorted by schedule date.</p>
            </div>
            {canWork && (
              <button type="button" className="btn-link flex-row" onClick={() => onNavigate('workActivity')}>
                Open <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="table-container">
            <table className="responsive-table">
              <thead>
                <tr><th>#</th><th>Schedule</th><th>Address</th><th>Description</th><th>Made by</th></tr>
              </thead>
              <tbody>
                {stats.overdue.length === 0 && stats.upcoming.length === 0 && (
                  <tr><td colSpan={5} className="empty-state">No active orders with a schedule.</td></tr>
                )}
                {[...stats.overdue, ...stats.upcoming].map(o => {
                  const isOverdue = o.schedule < today;
                  return (
                    <tr key={o.id} className={isOverdue ? 'row-overdue' : undefined}>
                      <td data-label="#"><SeqBadge seq={o.visualSeq} /></td>
                      <td data-label="Schedule" className={isOverdue ? 'text-danger fw-bold' : 'text-primary fw-bold'}>
                        {formatDateDisplay(o.schedule)}{isOverdue && ' ⚠'}
                      </td>
                      <td data-label="Address">{o.destination}</td>
                      <td data-label="Description">{o.description}</td>
                      <td data-label="Made by">{o.madeBy || 'Unassigned'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel h-400">
          <div className="panel-header">
            <span className="panel-icon"><PackageSearch size={20} /></span>
            <div className="flex-1">
              <h4>Low Stock Alerts</h4>
              <p>Products with {LOW_STOCK_THRESHOLD} units or fewer remaining.</p>
            </div>
          </div>
          <div className="table-container">
            <table className="responsive-table">
              <thead>
                <tr><th>PO #</th><th>Item</th><th>Model</th><th className="text-center">Stock</th></tr>
              </thead>
              <tbody>
                {stats.lowStock.length === 0 && <tr><td colSpan={4} className="empty-state">All products have stock.</td></tr>}
                {stats.lowStock.slice(0, 12).map((row, i) => (
                  <tr key={`${row.po}-${row.itemName}-${i}`}>
                    <td data-label="PO" className="text-primary fw-bold">{row.po || '-'}</td>
                    <td data-label="Item" className="fw-bold">{row.itemName}</td>
                    <td data-label="Model">{row.modelPart || '-'}</td>
                    <td data-label="Stock" className={`stock-cell${row.stock <= 0 ? ' depleted' : ''}`}>{row.stock} / {row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
