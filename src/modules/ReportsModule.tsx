import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import { BarChart2, Filter, Award, Activity, Wrench, MapPin, FileBarChart, Download, RotateCcw, X, CheckCircle2, AlertTriangle, Briefcase, PackageSearch, Repeat, TrendingUp, PieChart as PieIcon, Building2 } from 'lucide-react';
import type { JobProduct, JobOrder } from '../types';
import KpiCard from '../components/KpiCard';
import DestinationSearch from '../components/DestinationSearch';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { useAppData } from '../hooks/useAppData';
import { formatDateDisplay, displayName, formatSeq, getTodayString } from '../utils/helpers';
import { downloadWorkbook } from '../utils/excel';
import DataTable, { type DataColumn } from '../components/DataTable';
import NotesCell from '../components/NotesCell';
import SeqBadge from '../components/SeqBadge';
import Tabs, { type TabItem } from '../components/Tabs';
import { WorkFinishBadge, ScheduleCell } from '../components/StatusBadge';
import ChartCard from '../components/charts/ChartCard';
import MonthlyBars, { type MonthlyPoint } from '../components/charts/MonthlyBars';
import DonutChart from '../components/charts/DonutChart';
import RankBars from '../components/charts/RankBars';
import { countBy, lastMonths, monthKey, COLOR_SUCCESS, COLOR_PRIMARY, COLOR_DANGER, COLOR_WARNING, truncate } from '../components/charts/chartUtils';
import './ReportsModule.css';

type ReportTab = 'activities' | 'products' | 'po' | 'addresses' | 'repeated';

const includes = (haystack: string | undefined, needle: string) => !needle || (haystack || '').toLowerCase().includes(needle.toLowerCase());

const EMPTY_FILTERS = {
  startDate: '', endDate: '', dest: '', worker: '', itemName: '', po: '', serial: '', supplyCompany: '',
};
type FilterKey = keyof typeof EMPTY_FILTERS;
const FILTER_LABELS: Record<FilterKey, string> = {
  startDate: 'From', endDate: 'To', dest: 'Address', worker: 'User', itemName: 'Item', po: 'PO', serial: 'Serial', supplyCompany: 'Supplier',
};

export default function ReportsModule() {
  const { jobOrders, jobProducts, entrances, users, destinations, isLoading } = useAppData();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tab, setTab] = useState<ReportTab>('activities');
  const set = (key: FilterKey) => (value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const today = getTodayString();
  const activeFilters = (Object.keys(filters) as FilterKey[]).filter(k => filters[k] !== '');

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


  // ---- Datos para gráficos ----
  const { monthly, statusSlices, completed, overdue, byProperty, byTechnician, itemsByName } = useMemo(() => {
    const finished = filteredOrders.filter(o => o.workFinish === 'YES');
    const open = filteredOrders.filter(o => o.workFinish === 'NO');
    const late = open.filter(o => o.schedule && o.schedule < today);

    // Meses: rango de los filtros si existe; si no, últimos 6 meses (o todo el histórico si es más corto).
    let monthKeys: string[];
    if (filters.startDate || filters.endDate) {
      const keys = new Set(filteredOrders.map(o => monthKey(o.createdAt)).filter(Boolean));
      monthKeys = [...keys].sort();
    } else {
      monthKeys = lastMonths(today, 6);
    }
    const perMonth = new Map<string, MonthlyPoint>(monthKeys.map(k => [k, { month: k, finished: 0, open: 0 }]));
    for (const o of filteredOrders) {
      const point = perMonth.get(monthKey(o.createdAt));
      if (!point) continue;
      if (o.workFinish === 'YES') point.finished = Number(point.finished) + 1;
      else point.open = Number(point.open) + 1;
    }

    const propertyOf = new Map(destinations.map(d => [d.description, d.property || '']));
    const propCounts = countBy(filteredOrders, o => propertyOf.get(o.destination) || 'Other / unknown');

    return {
      monthly: [...perMonth.values()],
      statusSlices: [
        { name: 'Finished', value: finished.length, color: COLOR_SUCCESS },
        { name: 'In progress', value: open.length - late.length, color: COLOR_PRIMARY },
        { name: 'Overdue', value: late.length, color: COLOR_DANGER },
      ],
      completed: finished.length,
      overdue: late.length,
      byProperty: propCounts.map(([name, value]) => ({ name, value })),
      byTechnician: countBy(filteredOrders, o => o.madeBy || 'Unassigned').map(([name, value]) => ({ name, value })),
      itemsByName: countBy(filteredProductsDetailed, p => p.itemName || '(no name)', p => p.quantity).map(([name, value]) => ({ name, value })),
    };
  }, [filteredOrders, filteredProductsDetailed, destinations, filters.startDate, filters.endDate, today]);

  const poChart = useMemo(() => poAggregate.slice(0, 8).map(r => ({ month: r.po, received: r.totalArrived, installed: r.installed })), [poAggregate]);

  // ---- Columnas de las tablas ----
  const activityColumns = useMemo<DataColumn<JobOrder>[]>(() => [
    { id: 'seq', header: '#', value: o => o.visualSeq ?? null, type: 'number', align: 'center', width: '64px', hideable: false, render: o => <SeqBadge seq={o.visualSeq} /> },
    { id: 'createdAt', header: 'Registration', value: o => o.createdAt, type: 'date', nowrap: true, render: o => formatDateDisplay(o.createdAt) },
    { id: 'schedule', header: 'Schedule', value: o => o.schedule, type: 'date', nowrap: true, render: o => <ScheduleCell date={o.schedule} finished={o.workFinish === 'YES'} /> },
    { id: 'destination', header: 'Address', value: o => o.destination, nowrap: true, render: o => <span className="cell-strong">{o.destination}</span> },
    { id: 'description', header: 'Description', value: o => o.description, render: o => <span className="cell-clamp" title={o.description}>{o.description}</span> },
    { id: 'jobOrder', header: 'Ordered by', value: o => o.jobOrder },
    { id: 'madeBy', header: 'Made by', value: o => o.madeBy || '', render: o => o.madeBy || <span className="badge neutral">Unassigned</span> },
    { id: 'workFinish', header: 'Status', value: o => o.workFinish, align: 'center', render: o => <WorkFinishBadge value={o.workFinish} /> },
    { id: 'pendingWork', header: 'Notes', value: o => o.pendingWork || '', align: 'center', render: o => <NotesCell text={o.pendingWork} title={`Pending work — Order ${formatSeq(o.visualSeq)}`} subtitle={`${o.destination} · ${o.description}`} /> },
  ], []);

  type ProductRow = (typeof filteredProductsDetailed)[number];
  const productColumns = useMemo<DataColumn<ProductRow>[]>(() => [
    { id: 'orderDate', header: 'Date', value: p => p.orderDate, type: 'date', nowrap: true, render: p => formatDateDisplay(p.orderDate) },
    { id: 'orderDestination', header: 'Address', value: p => p.orderDestination, render: p => <span className="cell-strong">{p.orderDestination}</span> },
    { id: 'orderWorker', header: 'Ordered by', value: p => p.orderWorker },
    { id: 'orderMadeBy', header: 'Made by', value: p => p.orderMadeBy, defaultHidden: true },
    { id: 'itemName', header: 'Item', value: p => p.itemName, render: p => <span className="cell-strong">{p.itemName}</span> },
    { id: 'modelPart', header: 'Model #', value: p => p.modelPart },
    { id: 'serial', header: 'Serial #', value: p => p.serial, render: p => p.serial ? <span className="cell-mono">{p.serial}</span> : <span className="dt-dash">—</span> },
    { id: 'po', header: 'PO #', value: p => p.po, nowrap: true, render: p => <span className="cell-strong text-primary cell-mono">{p.po || '—'}</span> },
    { id: 'supplyCompany', header: 'Supplier', value: p => p.supplyCompany },
    { id: 'quantity', header: 'Qty', value: p => p.quantity, type: 'number', align: 'center', render: p => <span className="badge negative">-{p.quantity}</span> },
  ], []);

  type PoRow = (typeof poAggregate)[number];
  const poColumns = useMemo<DataColumn<PoRow>[]>(() => [
    { id: 'po', header: 'PO #', value: r => r.po, nowrap: true, hideable: false, render: r => <span className="cell-strong text-primary cell-mono">{r.po}</span> },
    { id: 'date', header: 'Date', value: r => r.date, type: 'date', nowrap: true, render: r => formatDateDisplay(r.date) },
    { id: 'supplyCompany', header: 'Supplier', value: r => r.supplyCompany },
    { id: 'productsCount', header: 'Products', value: r => r.productsCount, type: 'number', align: 'center' },
    { id: 'totalArrived', header: 'Received', value: r => r.totalArrived, type: 'number', align: 'center', render: r => <span className="fw-bold">{r.totalArrived}</span> },
    { id: 'installed', header: 'Installed', value: r => r.installed, type: 'number', align: 'center', render: r => <span className="badge negative">-{r.installed}</span> },
    { id: 'remaining', header: 'Remaining', value: r => r.remaining, type: 'number', align: 'center', render: r => <span className={`badge ${r.remaining <= 0 ? 'danger' : 'success'}`}>{r.remaining}</span> },
    { id: 'usage', header: 'Usage', value: r => (r.totalArrived > 0 ? Math.round((r.installed / r.totalArrived) * 100) : 0), type: 'number', align: 'center', width: '150px',
      render: r => { const pct = r.totalArrived > 0 ? Math.round((r.installed / r.totalArrived) * 100) : 0; return <UsageBar percent={pct} />; } },
  ], []);

  type AptRow = (typeof aptList)[number];
  const aptColumns = useMemo<DataColumn<AptRow>[]>(() => [
    { id: 'dest', header: 'Address', value: a => a.dest, hideable: false, render: a => <span className="cell-strong">{a.dest}</span> },
    { id: 'count', header: 'Interventions', value: a => a.count, type: 'number', align: 'center', render: a => <span className="badge info">{a.count}</span> },
  ], []);

  type RepRow = (typeof repeatedList)[number];
  const repeatedColumns = useMemo<DataColumn<RepRow>[]>(() => [
    { id: 'dest', header: 'Address', value: r => r.dest, hideable: false, render: r => <span className="cell-strong">{r.dest}</span> },
    { id: 'desc', header: 'Task', value: r => r.desc, render: r => <span className="cell-clamp" title={r.desc}>{r.desc}</span> },
    { id: 'count', header: 'Times done', value: r => r.count, type: 'number', align: 'center', render: r => <span className={`badge ${r.count > 1 ? 'danger' : 'success'}`}>{r.count}</span> },
  ], []);

  const tabs: TabItem<ReportTab>[] = [
    { id: 'activities', label: 'Work Activities', icon: <Briefcase size={15} />, count: filteredOrders.length },
    { id: 'products', label: 'Products Installed', icon: <Wrench size={15} />, count: filteredProductsDetailed.length },
    { id: 'po', label: 'Items by PO', icon: <PackageSearch size={15} />, count: poAggregate.length },
    { id: 'addresses', label: 'Works per Address', icon: <MapPin size={15} />, count: aptList.length },
    { id: 'repeated', label: 'Repeated Tasks', icon: <Repeat size={15} />, count: repeatedList.filter(r => r.count > 1).length },
  ];

  if (isLoading) return <LoadingScreen message="Loading reports..." />;

  const completionRate = filteredOrders.length ? Math.round((completed / filteredOrders.length) * 100) : 0;
  const filterLabel = (k: FilterKey) => (k === 'startDate' || k === 'endDate' ? formatDateDisplay(filters[k]) : truncate(filters[k], 28));

  return (
    <div className="card max-1400 catalog-manager-anim">
      <ModuleHeader
        icon={<BarChart2 size={28} />}
        title="Analytics & Reports"
        subtitle="Work activity, locations and inventory consumption. Every table and chart follows the filters below."
        actions={
          <button type="button" className="action btn-secondary btn-header" onClick={handleExport} title="Download the filtered data as an Excel workbook">
            <Download size={18} /> Export to Excel
          </button>
        }
      />

      <section className="filter-panel">
        <div className="filter-panel-head">
          <h3><Filter size={16} /> Filters</h3>
          {activeFilters.length > 0 && (
            <button type="button" className="dt-tool" onClick={() => setFilters(EMPTY_FILTERS)}><RotateCcw size={14} /> Reset all</button>
          )}
        </div>
        <div className="form-grid compact">
          <div className="form-group"><label>Start Date</label><input type="date" value={filters.startDate} onChange={e => set('startDate')(e.target.value)} /></div>
          <div className="form-group"><label>End Date</label><input type="date" value={filters.endDate} onChange={e => set('endDate')(e.target.value)} /></div>
          <div className="form-group">
            <label>Address</label>
            <DestinationSearch includeAll allowCustom={false} value={filters.dest} onSelect={set('dest')} placeholder="All addresses" />
          </div>
          <div className="form-group">
            <label>Account User</label>
            <select value={filters.worker} onChange={e => set('worker')(e.target.value)}>
              <option value="">All Account Users</option>
              {accountUsers.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Item Name</label><input type="text" placeholder="Search by name..." value={filters.itemName} onChange={e => set('itemName')(e.target.value)} /></div>
          <div className="form-group"><label>PO #</label><input type="text" placeholder="Search PO..." value={filters.po} onChange={e => set('po')(e.target.value)} /></div>
          <div className="form-group"><label>Serial #</label><input type="text" placeholder="Search serial..." value={filters.serial} onChange={e => set('serial')(e.target.value)} /></div>
          <div className="form-group">
            <label>Supply Company</label>
            <select value={filters.supplyCompany} onChange={e => set('supplyCompany')(e.target.value)}>
              <option value="">All Companies</option>
              {supplyCompanyOptions.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
          </div>
        </div>
        {activeFilters.length > 0 && (
          <div className="filter-chips" aria-label="Active filters">
            {activeFilters.map(k => (
              <span key={k} className="filter-chip">
                {FILTER_LABELS[k]}: {filterLabel(k)}
                <button type="button" onClick={() => set(k)('')} title={`Remove ${FILTER_LABELS[k]} filter`} aria-label={`Remove ${FILTER_LABELS[k]} filter`}><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="kpi-grid">
        <KpiCard icon={<Activity size={20} />} label="Activities" value={filteredOrders.length} tone="blue" note={`${filteredOrders.length - completed} still open`} />
        <KpiCard icon={<CheckCircle2 size={20} />} label="Completed" value={<>{completed} <small className="kpi-sub">({completionRate}%)</small></>} tone="green" note="Work finish = YES" />
        <KpiCard icon={<AlertTriangle size={20} />} label="Overdue" value={overdue} tone={overdue > 0 ? 'red' : 'slate'} note="Scheduled before today, not finished" />
        <KpiCard icon={<Wrench size={20} />} label="Items Installed" value={totalItemsInstalled} tone="purple" note={`${filteredProductsDetailed.length} product lines`} />
        <KpiCard icon={<MapPin size={20} />} label="Top Address" value={<span className="kpi-value small">{mostWorkedApt}</span>} tone="cyan" note={aptList[0] ? `${aptList[0].count} interventions` : undefined} />
        <KpiCard icon={<Award size={20} />} label="Top Account User" value={<span className="kpi-value small">{topWorker}</span>} tone="orange" />
      </div>

      <div className="chart-grid">
        <ChartCard title="Activity over time" subtitle="Orders registered per month, by status" icon={<TrendingUp size={16} />} wide empty={filteredOrders.length === 0}>
          <MonthlyBars data={monthly} series={[{ key: 'finished', name: 'Finished', color: COLOR_SUCCESS }, { key: 'open', name: 'Open', color: COLOR_PRIMARY }]} />
        </ChartCard>
        <ChartCard title="Completion status" subtitle="Finished vs in progress vs overdue" icon={<PieIcon size={16} />} empty={filteredOrders.length === 0}>
          <DonutChart data={statusSlices} centerLabel="Orders" />
        </ChartCard>
        <ChartCard title="Top addresses" subtitle="Most interventions" icon={<MapPin size={16} />} empty={aptList.length === 0}>
          <RankBars data={aptList.map(a => ({ name: a.dest, value: a.count }))} valueName="Interventions" />
        </ChartCard>
        <ChartCard title="Items installed by product" subtitle="Units consumed per item name" icon={<Wrench size={16} />} empty={itemsByName.length === 0}>
          <DonutChart data={itemsByName} centerLabel="Units" />
        </ChartCard>
        <ChartCard title="Work by property" subtitle="Orders per apartment complex" icon={<Building2 size={16} />} empty={byProperty.length === 0}>
          <DonutChart data={byProperty} centerLabel="Orders" />
        </ChartCard>
        <ChartCard title="Received vs installed by PO" subtitle="Latest purchase orders" icon={<FileBarChart size={16} />} wide empty={poChart.length === 0}>
          <MonthlyBars data={poChart} stacked={false} xFormatter={v => v} series={[{ key: 'received', name: 'Received', color: COLOR_PRIMARY }, { key: 'installed', name: 'Installed', color: COLOR_WARNING }]} />
        </ChartCard>
        <ChartCard title="Work by technician" subtitle="Orders per 'Made by'" icon={<Award size={16} />} empty={byTechnician.length === 0}>
          <RankBars data={byTechnician} valueName="Orders" multicolor />
        </ChartCard>
      </div>

      <div className="section-head">
        <span className="section-icon"><FileBarChart size={18} /></span>
        <div>
          <h3>Detailed data</h3>
          <p>Sort by any column, filter per column or hide columns. The Excel export includes every tab.</p>
        </div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'activities' && (
        <DataTable<JobOrder> columns={activityColumns} rows={filteredOrders} rowKey={o => o.id} storageKey="report_activities" initialSort={{ id: 'createdAt', dir: 'desc' }} compact emptyMessage="No activities match the current filters." />
      )}
      {tab === 'products' && (
        <DataTable<ProductRow> columns={productColumns} rows={filteredProductsDetailed} rowKey={p => p.id ?? `${p.jobOrderId}-${p.entranceDetailId}-${p.itemName}`} storageKey="report_products" initialSort={{ id: 'orderDate', dir: 'desc' }} compact emptyMessage="No products installed for the current filters." />
      )}
      {tab === 'po' && (
        <DataTable<PoRow> columns={poColumns} rows={poAggregate} rowKey={r => r.entranceId} storageKey="report_po" initialSort={{ id: 'po', dir: 'desc' }} compact emptyMessage="No POs found for the current filters." />
      )}
      {tab === 'addresses' && (
        <DataTable<AptRow> columns={aptColumns} rows={aptList} rowKey={a => a.dest} storageKey="report_addresses" initialSort={{ id: 'count', dir: 'desc' }} compact emptyMessage="No data available." />
      )}
      {tab === 'repeated' && (
        <DataTable<RepRow> columns={repeatedColumns} rows={repeatedList} rowKey={r => `${r.dest}|${r.desc}`} storageKey="report_repeated" initialSort={{ id: 'count', dir: 'desc' }} compact emptyMessage="No data available." />
      )}
    </div>
  );
}

/** Barra de consumo de un PO (0–100 %). */
function UsageBar({ percent }: { percent: number }) {
  const cls = percent >= 100 ? 'full' : percent >= 70 ? 'high' : '';
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className={`progress-bar ${cls}`} style={{ '--progress': `${Math.min(percent, 100)}%` } as CSSProperties} />
      </div>
      <span className="progress-label">{percent}%</span>
    </div>
  );
}
