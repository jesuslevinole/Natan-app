import { useState, useMemo, useCallback, type CSSProperties } from 'react';
import { BarChart2, Filter, Wrench, MapPin, FileBarChart, Download, RotateCcw, X, FileText, Briefcase, PackageSearch, Repeat } from 'lucide-react';
import type { JobProduct, JobOrder } from '../types';
import DestinationSearch from '../components/DestinationSearch';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { useAppData } from '../hooks/useAppData';
import { formatDateDisplay, displayName, formatSeq, getTodayString, formatCurrency } from '../utils/helpers';
import { downloadWorkbook } from '../utils/excel';
import DataTable, { type DataColumn } from '../components/DataTable';
import NotesCell from '../components/NotesCell';
import SeqBadge from '../components/SeqBadge';
import Tabs, { type TabItem } from '../components/Tabs';
import RequirePermission from '../components/RequirePermission';
import { useCompany } from '../hooks/useCompany';
import { useAuthorName } from '../hooks/useAuth';
import { AuditLogger } from '../utils/logger';
import { WorkFinishBadge, ScheduleCell } from '../components/StatusBadge';
import { truncate } from '../components/charts/chartUtils';
import ShareBar from '../components/charts/ShareBar';
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
  const { jobOrders, jobProducts, entrances, users, isLoading } = useAppData();
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

  const priceByDetail = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entrances) for (const d of e.details) if (d.price) map.set(d.detailId, d.price);
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
          unitPrice: priceByDetail.get(p.entranceDetailId || '') ?? null,
        };
      })
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [jobProducts, filteredOrders, productMatches, supplyCompanyOf, priceByDetail]);

  const { totalItemsInstalled, installedValue, aptList, mostWorkedApt, repeatedList } = useMemo(() => {
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
      installedValue: filteredProductsDetailed.reduce((sum, p) => sum + p.quantity * (p.unitPrice ?? 0), 0),
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

  const { company } = useCompany();
  const authorName = useAuthorName();
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const handleExportPdf = async () => {
    setIsPdfBusy(true);
    try {
      const pdf = await import('../utils/pdf');
      const doc = pdf.createDoc();
      const periodLabel = filters.startDate || filters.endDate
        ? `${filters.startDate ? formatDateDisplay(filters.startDate) : 'Beginning'} — ${filters.endDate ? formatDateDisplay(filters.endDate) : 'Today'}`
        : 'All time';
      const filterText = activeFilters.length
        ? activeFilters.map(k => `${FILTER_LABELS[k]}: ${k === 'startDate' || k === 'endDate' ? formatDateDisplay(filters[k]) : filters[k]}`).join('   ·   ')
        : 'No filters applied (all data)';
      let y = pdf.brandHeader(doc, company, 'Operations Report', `Period: ${periodLabel}    ·    ${filterText}`, authorName);

      y = pdf.kpiStrip(doc, y, [
        { label: 'Activities', value: String(filteredOrders.length), note: `${filteredOrders.length - completed} still open`, color: pdf.PDF_COLORS.PRIMARY },
        { label: 'Completed', value: `${completed} (${completionRate}%)`, note: 'Work finish = YES', color: pdf.PDF_COLORS.GREEN },
        { label: 'Overdue', value: String(overdue), note: 'Scheduled before today, not finished', color: overdue > 0 ? pdf.PDF_COLORS.RED : pdf.PDF_COLORS.SLATE },
        { label: 'Items installed', value: String(totalItemsInstalled), note: installedValue > 0 ? `${formatCurrency(installedValue)} in materials` : `${filteredProductsDetailed.length} product lines`, color: pdf.PDF_COLORS.PURPLE },
        { label: 'Top address', value: truncate(mostWorkedApt, 22), note: aptList[0] ? `${aptList[0].count} interventions` : undefined, color: pdf.PDF_COLORS.ORANGE },
      ]);

      y = pdf.sectionTitle(doc, y, `Work Activities (${filteredOrders.length})`);
      y = pdf.drawTable(doc, y + 6,
        ['#', 'Registered', 'Schedule', 'Address', 'Description', 'Ordered by', 'Status', 'Pending work'],
        filteredOrders.map(o => [formatSeq(o.visualSeq), formatDateDisplay(o.createdAt), o.schedule ? formatDateDisplay(o.schedule) : '—', o.destination, o.description, o.jobOrder, o.workFinish === 'YES' ? 'Finished' : (o.schedule && o.schedule < today ? 'OVERDUE' : 'Open'), o.pendingWork || '—']),
        { columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 56 }, 2: { cellWidth: 56 }, 3: { cellWidth: 100 }, 6: { cellWidth: 52, halign: 'center' } },
          didParseCell: (data) => { if (data.section === 'body' && data.column.index === 6 && data.cell.raw === 'OVERDUE') data.cell.styles.textColor = pdf.PDF_COLORS.RED; } });

      y = pdf.ensureSpace(doc, y, 120);
      y = pdf.sectionTitle(doc, y, `Products Installed (${filteredProductsDetailed.length})`, pdf.PDF_COLORS.PURPLE);
      y = pdf.drawTable(doc, y + 6,
        ['Date', 'Address', 'Item', 'Model #', 'Serial #', 'PO #', 'Supplier', 'Qty', 'Unit price', 'Total'],
        filteredProductsDetailed.map(p => [formatDateDisplay(p.orderDate), p.orderDestination, p.itemName, p.modelPart, p.serial || '—', p.po || '—', p.supplyCompany, p.quantity, p.unitPrice === null ? '—' : formatCurrency(p.unitPrice), p.unitPrice === null ? '—' : formatCurrency(p.unitPrice * p.quantity)]),
        { columnStyles: { 7: { halign: 'center' }, 8: { halign: 'right' }, 9: { halign: 'right', fontStyle: 'bold' } } });

      y = pdf.ensureSpace(doc, y, 120);
      y = pdf.sectionTitle(doc, y, `Items by PO (${poAggregate.length})`, pdf.PDF_COLORS.ORANGE);
      y = pdf.drawTable(doc, y + 6,
        ['PO #', 'Date', 'Supplier', 'Products', 'Received', 'Installed', 'Remaining', 'Usage'],
        poAggregate.map(r => [r.po, formatDateDisplay(r.date), r.supplyCompany, r.productsCount, r.totalArrived, r.installed, r.remaining, `${r.totalArrived > 0 ? Math.round((r.installed / r.totalArrived) * 100) : 0}%`]),
        { columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' } } });

      y = pdf.ensureSpace(doc, y, 120);
      y = pdf.sectionTitle(doc, y, `Works per Address (${aptList.length})`, pdf.PDF_COLORS.GREEN);
      y = pdf.drawTable(doc, y + 6,
        ['Address', 'Interventions', 'Share'],
        aptList.map(a => [a.dest, a.count, `${filteredOrders.length ? Math.round((a.count / filteredOrders.length) * 100) : 0}%`]),
        { columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } }, tableWidth: 420 });

      const repeated = repeatedList.filter(r => r.count > 1);
      if (repeated.length > 0) {
        y = pdf.ensureSpace(doc, y, 120);
        y = pdf.sectionTitle(doc, y, `Repeated Tasks (${repeated.length})`, pdf.PDF_COLORS.RED);
        pdf.drawTable(doc, y + 6, ['Address', 'Task', 'Times done'], repeated.map(r => [r.dest, r.desc, r.count]), { columnStyles: { 2: { halign: 'center' } } });
      }

      pdf.addFooters(doc, company, 'Operations Report');
      doc.save(`report-${getTodayString()}.pdf`);
      AuditLogger.log({ action: 'EXPORT', module: 'Reports (PDF)', user: authorName, details: `PDF report generated (${filteredOrders.length} orders)` });
    } catch (err) {
      console.error('PDF export failed', err);
      alert('Could not generate the PDF. Please try again.');
    } finally {
      setIsPdfBusy(false);
    }
  };

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
  const { completed, overdue } = useMemo(() => {
    const finished = filteredOrders.filter(o => o.workFinish === 'YES');
    const open = filteredOrders.filter(o => o.workFinish === 'NO');
    const late = open.filter(o => o.schedule && o.schedule < today);
    return { completed: finished.length, overdue: late.length };
  }, [filteredOrders, today]);

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
    { id: 'unitPrice', header: 'Unit Price', value: p => p.unitPrice, type: 'number', align: 'right', render: p => formatCurrency(p.unitPrice) },
    { id: 'total', header: 'Total', value: p => (p.unitPrice === null ? null : p.unitPrice * p.quantity), type: 'number', align: 'right', render: p => p.unitPrice === null ? <span className="dt-dash">—</span> : <span className="fw-bold">{formatCurrency(p.unitPrice * p.quantity)}</span> },
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
    { id: 'count', header: 'Interventions', value: a => a.count, type: 'number', align: 'left', width: '220px', render: a => <ShareBar value={a.count} total={filteredOrders.length} /> },
  ], [filteredOrders.length]);

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
        subtitle="Work activity, locations and inventory consumption. Every KPI and table follows the filters below. Charts live on the Dashboard."
        actions={
          <RequirePermission permission="export_reports">
            <button type="button" className="action btn-secondary btn-header" onClick={handleExport} title="Download the filtered data as an Excel workbook">
              <Download size={18} /> Excel
            </button>
            <button type="button" className="action btn-primary btn-header" onClick={handleExportPdf} disabled={isPdfBusy} title="Generate a management-ready PDF of this report">
              <FileText size={18} /> {isPdfBusy ? 'Generating...' : 'Export PDF'}
            </button>
          </RequirePermission>
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
