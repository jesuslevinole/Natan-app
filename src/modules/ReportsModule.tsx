import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import { BarChart2, Filter, Award, Activity, Wrench, MapPin, FileBarChart, Download, RotateCcw } from 'lucide-react';
import type { JobProduct } from '../types';
import KpiCard from '../components/KpiCard';
import DestinationSearch from '../components/DestinationSearch';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { useAppData } from '../hooks/useAppData';
import { formatDateDisplay, displayName } from '../utils/helpers';
import { downloadWorkbook } from '../utils/excel';
import './ReportsModule.css';

const includes = (haystack: string | undefined, needle: string) => !needle || (haystack || '').toLowerCase().includes(needle.toLowerCase());

const EMPTY_FILTERS = {
  startDate: '', endDate: '', dest: '', worker: '', itemName: '', po: '', serial: '', supplyCompany: '',
};

export default function ReportsModule() {
  const { jobOrders, jobProducts, entrances, users, isLoading } = useAppData();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const set = (key: keyof typeof EMPTY_FILTERS) => (value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const accountUsers = useMemo(() => users.map(u => displayName(u, u.email)).sort(), [users]);

  // Lookups del PO (header) por entranceId y detailId → supply company de un JobProduct.
  const supplyByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entrances) {
      map.set(e.id, e.supplyCompany || '');
      for (const d of e.details) map.set(d.detailId, e.supplyCompany || '');
    }
    return map;
  }, [entrances]);

  const supplyCompanyOf = useCallback(
    (p: JobProduct) => supplyByKey.get(p.entranceDetailId || '') ?? supplyByKey.get(p.itemEntranceId) ?? '',
    [supplyByKey],
  );

  const supplyCompanyOptions = useMemo(
    () => [...new Set(entrances.map(e => e.supplyCompany).filter(Boolean))].sort(),
    [entrances],
  );

  const productFiltersActive = !!(filters.itemName || filters.po || filters.serial || filters.supplyCompany);

  const productMatches = useCallback((p: JobProduct) =>
    includes(p.itemName, filters.itemName) && includes(p.po, filters.po) && includes(p.serial, filters.serial)
    && (!filters.supplyCompany || supplyCompanyOf(p) === filters.supplyCompany),
  [filters, supplyCompanyOf]);

  const productsByOrder = useMemo(() => {
    const map = new Map<string, JobProduct[]>();
    for (const p of jobProducts) {
      const list = map.get(p.jobOrderId);
      if (list) list.push(p); else map.set(p.jobOrderId, [p]);
    }
    return map;
  }, [jobProducts]);

  const filteredOrders = useMemo(() => jobOrders.filter(o => {
    const date = (o.createdAt || '').split('T')[0];
    if (filters.startDate && date < filters.startDate) return false;
    if (filters.endDate && date > filters.endDate) return false;
    if (filters.dest && o.destination !== filters.dest) return false;
    if (filters.worker && o.jobOrder !== filters.worker && o.madeBy !== filters.worker) return false;
    if (productFiltersActive && !(productsByOrder.get(o.id) ?? []).some(productMatches)) return false;
    return true;
  }), [jobOrders, filters, productFiltersActive, productsByOrder, productMatches]);

  const filteredProductsDetailed = useMemo(() => {
    const orderById = new Map(filteredOrders.map(o => [o.id, o]));
    return jobProducts
      .filter(p => orderById.has(p.jobOrderId) && productMatches(p))
      .map(p => {
        const order = orderById.get(p.jobOrderId)!;
        return {
          ...p,
          orderDate: order.createdAt || '',
          orderDestination: order.destination || '',
          orderWorker: order.jobOrder || '',
          orderMadeBy: order.madeBy || '',
          supplyCompany: supplyCompanyOf(p),
        };
      })
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [jobProducts, filteredOrders, productMatches, supplyCompanyOf]);

  const { totalItemsInstalled, aptList, mostWorkedApt, repeatedList, topWorker } = useMemo(() => {
    const count = (keys: string[]) => {
      const m = new Map<string, number>();
      keys.forEach(k => m.set(k, (m.get(k) || 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const apt = count(filteredOrders.map(o => o.destination || '(no address)'));
    const repeated = count(filteredOrders.map(o => `${o.destination} ||| ${o.description}`)).map(([key, n]) => {
      const [dest, desc] = key.split(' ||| ');
      return { dest, desc, count: n };
    });
    const workers = count(filteredOrders.map(o => o.jobOrder));
    return {
      totalItemsInstalled: filteredProductsDetailed.reduce((sum, p) => sum + p.quantity, 0),
      aptList: apt.map(([dest, n]) => ({ dest, count: n })),
      mostWorkedApt: apt[0]?.[0] ?? '-',
      repeatedList: repeated,
      topWorker: workers[0]?.[0] ?? '-',
    };
  }, [filteredOrders, filteredProductsDetailed]);

  const poAggregate = useMemo(() => entrances
    .map(entrance => {
      if (filters.supplyCompany && entrance.supplyCompany !== filters.supplyCompany) return null;
      if (!includes(entrance.po, filters.po)) return null;
      const totalArrived = entrance.details.reduce((sum, d) => sum + (d.itemsArrived || 0), 0);
      const detailIds = new Set(entrance.details.map(d => d.detailId));
      const linked = jobProducts.filter(p => (p.entranceDetailId ? detailIds.has(p.entranceDetailId) : p.itemEntranceId === entrance.id));
      const matching = linked.filter(p => includes(p.itemName, filters.itemName) && includes(p.serial, filters.serial));
      if ((filters.itemName || filters.serial) && matching.length === 0) return null;
      const installedAll = linked.reduce((sum, p) => sum + p.quantity, 0);
      return {
        entranceId: entrance.id,
        po: entrance.po || '-',
        supplyCompany: entrance.supplyCompany || '-',
        date: entrance.date || '',
        productsCount: entrance.details.length,
        totalArrived,
        installed: matching.reduce((sum, p) => sum + p.quantity, 0),
        remaining: totalArrived - installedAll,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.po.localeCompare(a.po)), [entrances, jobProducts, filters]);

  const handleExport = () => {
    downloadWorkbook(`natan-report-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: 'Work Activities', rows: filteredOrders.map(o => ({
        '#': o.visualSeq, 'Registration Date': o.createdAt, Schedule: o.schedule, 'Ordered by': o.jobOrder,
        'Made by': o.madeBy || '', Address: o.destination, Description: o.description, 'Work Finish': o.workFinish, 'Pending Work': o.pendingWork,
      })) },
      { name: 'Products Installed', rows: filteredProductsDetailed.map(p => ({
        Date: p.orderDate, Address: p.orderDestination, 'Ordered by': p.orderWorker, 'Made by': p.orderMadeBy,
        'Item Name': p.itemName, 'Model #': p.modelPart, 'Serial #': p.serial, 'PO #': p.po, 'Supply Company': p.supplyCompany, Qty: p.quantity,
      })) },
      { name: 'Items by PO', rows: poAggregate.map(r => ({
        'PO #': r.po, Date: r.date, 'Supply Company': r.supplyCompany, Products: r.productsCount,
        Received: r.totalArrived, Installed: r.installed, Remaining: r.remaining,
      })) },
      { name: 'Works per Address', rows: aptList.map(a => ({ Address: a.dest, Interventions: a.count })) },
    ]);
  };

  if (isLoading) return <LoadingScreen message="Loading reports..." />;

  return (
    <div className="card max-1400 catalog-manager-anim">
      <ModuleHeader
        icon={<BarChart2 size={28} />}
        title="Analytics & Reports"
        subtitle="Analyze work activities, locations, and products installed."
        actions={
          <button type="button" className="action btn-secondary btn-header" onClick={handleExport} title="Download the filtered data as an Excel workbook">
            <Download size={18} /> Export to Excel
          </button>
        }
      />

      <div className="dark-filter-panel">
        <div className="dark-filter-title">
          <div className="dark-filter-icon"><Filter size={20} /></div>
          <h3>Command Center Filters</h3>
          {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
            <button type="button" className="chip dark-reset" onClick={() => setFilters(EMPTY_FILTERS)}><RotateCcw size={14} /> Reset</button>
          )}
        </div>
        <div className="form-grid compact">
          <div className="form-group"><label>Start Date</label><input type="date" value={filters.startDate} onChange={e => set('startDate')(e.target.value)} /></div>
          <div className="form-group"><label>End Date</label><input type="date" value={filters.endDate} onChange={e => set('endDate')(e.target.value)} /></div>
          <div className="form-group">
            <label>Address</label>
            <DestinationSearch theme="dark" includeAll allowCustom={false} value={filters.dest} onSelect={set('dest')} placeholder="-- Search Address --" />
          </div>
          <div className="form-group">
            <label>Account User</label>
            <select value={filters.worker} onChange={e => set('worker')(e.target.value)}>
              <option value="" className="dark-option">All Account Users</option>
              {accountUsers.map(name => <option key={name} value={name} className="dark-option">{name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Item Name</label><input type="text" placeholder="Search by name..." value={filters.itemName} onChange={e => set('itemName')(e.target.value)} /></div>
          <div className="form-group"><label>PO #</label><input type="text" placeholder="Search PO..." value={filters.po} onChange={e => set('po')(e.target.value)} /></div>
          <div className="form-group"><label>Serial #</label><input type="text" placeholder="Search serial..." value={filters.serial} onChange={e => set('serial')(e.target.value)} /></div>
          <div className="form-group">
            <label>Supply Company</label>
            <select value={filters.supplyCompany} onChange={e => set('supplyCompany')(e.target.value)}>
              <option value="" className="dark-option">All Companies</option>
              {supplyCompanyOptions.map(sc => <option key={sc} value={sc} className="dark-option">{sc}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard icon={<Activity size={24} />} label="Total Activities" value={filteredOrders.length} tone="blue" />
        <KpiCard icon={<Wrench size={24} />} label="Items Installed" value={totalItemsInstalled} tone="purple" />
        <KpiCard icon={<MapPin size={24} />} label="Top Address" value={<span className="kpi-value small">{mostWorkedApt}</span>} tone="green" />
        <KpiCard icon={<Award size={24} />} label="Top Account User" value={<span className="kpi-value small">{topWorker}</span>} tone="orange" />
      </div>

      <div className="panel-grid">
        <div className="panel h-350">
          <div className="panel-header"><h4>Works per Address</h4></div>
          <div className="table-container">
            <table className="responsive-table">
              <thead><tr><th>Address</th><th className="text-center">Total Interventions</th></tr></thead>
              <tbody>
                {aptList.length === 0 && <tr><td colSpan={2} className="empty-state">No data available.</td></tr>}
                {aptList.map(item => (
                  <tr key={item.dest}>
                    <td data-label="Address" className="fw-bold">{item.dest}</td>
                    <td data-label="Total" className="text-center"><span className="badge info">{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel h-350">
          <div className="panel-header"><h4>Repeated Tasks per Address</h4></div>
          <div className="table-container">
            <table className="responsive-table">
              <thead><tr><th>Address</th><th>Description (Task)</th><th className="text-center">Times Done</th></tr></thead>
              <tbody>
                {repeatedList.length === 0 && <tr><td colSpan={3} className="empty-state">No data available.</td></tr>}
                {repeatedList.map(item => (
                  <tr key={`${item.dest}|${item.desc}`}>
                    <td data-label="Address">{item.dest}</td>
                    <td data-label="Desc" className="text-body">{item.desc}</td>
                    <td data-label="Times" className="text-center"><span className={`badge ${item.count > 1 ? 'danger' : 'success'}`}>{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel h-400 mb-5">
        <div className="panel-header">
          <span className="panel-icon"><FileBarChart size={20} /></span>
          <div className="flex-1">
            <h4>Items by Purchase Order</h4>
            <p>Inventory consumption tracked per PO. Shows how many items were received vs installed vs remaining in stock.</p>
          </div>
          <span className="text-sm text-muted"><strong>{poAggregate.length}</strong> POs</span>
        </div>
        <div className="table-container">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>PO #</th><th>Date</th><th>Supply Company</th>
                <th className="text-center"># Products</th><th className="text-center">Items Received</th>
                <th className="text-center">Items Installed</th><th className="text-center">Remaining Stock</th><th className="text-center">Usage</th>
              </tr>
            </thead>
            <tbody>
              {poAggregate.length === 0 && <tr><td colSpan={8} className="empty-state">No POs found for current filters.</td></tr>}
              {poAggregate.map(row => {
                const usagePercent = row.totalArrived > 0 ? Math.round((row.installed / row.totalArrived) * 100) : 0;
                const barCls = usagePercent >= 100 ? 'full' : usagePercent >= 70 ? 'high' : '';
                return (
                  <tr key={row.entranceId}>
                    <td data-label="PO" className="fw-bold text-primary">{row.po}</td>
                    <td data-label="Date">{formatDateDisplay(row.date)}</td>
                    <td data-label="Company" className="text-body">{row.supplyCompany}</td>
                    <td data-label="Products" className="text-center">{row.productsCount}</td>
                    <td data-label="Received" className="text-center fw-bold">{row.totalArrived}</td>
                    <td data-label="Installed" className="text-center"><span className="badge negative">-{row.installed}</span></td>
                    <td data-label="Remaining" className="text-center"><span className={`badge ${row.remaining <= 0 ? 'danger' : 'success'}`}>{row.remaining}</span></td>
                    <td data-label="Usage" className="text-center">
                      <div className="progress-wrap">
                        <div className="progress-track">
                          {/* El ancho es un valor de runtime → variable CSS */}
                          <div className={`progress-bar ${barCls}`} style={{ '--progress': `${Math.min(usagePercent, 100)}%` } as CSSProperties} />
                        </div>
                        <span className="progress-label">{usagePercent}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel h-450">
        <div className="panel-header">
          <div className="flex-1">
            <h4>Products Installed Log</h4>
            <p>Detailed list of materials used in the filtered activities.</p>
          </div>
          <span className="text-sm text-muted"><strong>{filteredProductsDetailed.length}</strong> rows</span>
        </div>
        <div className="table-container">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Date</th><th>Address</th><th>Account User</th><th>Item Name</th><th>Model #</th><th>Serial #</th>
                <th>PO #</th><th>Supply Company</th><th className="text-center">Qty Installed</th>
              </tr>
            </thead>
            <tbody>
              {filteredProductsDetailed.length === 0 && <tr><td colSpan={9} className="empty-state">No products found for current filters.</td></tr>}
              {filteredProductsDetailed.map(p => (
                <tr key={p.id}>
                  <td data-label="Date">{formatDateDisplay(p.orderDate)}</td>
                  <td data-label="Address">{p.orderDestination}</td>
                  <td data-label="Account User" className="fw-bold">{p.orderWorker}</td>
                  <td data-label="Item" className="fw-bold">{p.itemName}</td>
                  <td data-label="Model" className="text-body">{p.modelPart || '-'}</td>
                  <td data-label="Serial" className="text-body">{p.serial || '-'}</td>
                  <td data-label="PO" className="fw-600 text-primary">{p.po || '-'}</td>
                  <td data-label="Company" className="text-body">{p.supplyCompany || '-'}</td>
                  <td data-label="Qty" className="text-center"><span className="badge negative">-{p.quantity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
