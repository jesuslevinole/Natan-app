import { useMemo, useState } from 'react';
import {
  LayoutDashboard, Briefcase, CalendarClock, AlertTriangle, PackageSearch, Boxes, MapPin, ArrowRight,
  Plus, FileSpreadsheet, BarChart2, TrendingUp, PieChart as PieIcon, CheckCircle2, Clock, DollarSign, Wrench, Building2, Award, FileBarChart,
  FileText,
} from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import { useCompany } from '../hooks/useCompany';
import { AuditLogger } from '../utils/logger';
import { getDetailStock, getEntranceStock } from '../utils/entrance';
import ChartTypeToggle from '../components/charts/ChartTypeToggle';
import { useChartVariant } from '../hooks/useChartVariant';
import { formatDateDisplay, getTodayString, formatSeq, formatCurrency } from '../utils/helpers';
import KpiCard from '../components/KpiCard';
import LoadingScreen from '../components/LoadingScreen';
import SeqBadge from '../components/SeqBadge';
import DataTable, { type DataColumn } from '../components/DataTable';
import NotesCell from '../components/NotesCell';
import { ScheduleCell, StockLevel } from '../components/StatusBadge';
import ChartCard from '../components/charts/ChartCard';
import MonthlyBars, { type MonthlyPoint } from '../components/charts/MonthlyBars';
import DonutChart from '../components/charts/DonutChart';
import RankBars from '../components/charts/RankBars';
import { countBy, lastMonths, monthKey, donutSlices, COLOR_SUCCESS, COLOR_PRIMARY, COLOR_DANGER, COLOR_WARNING } from '../components/charts/chartUtils';
import type { JobOrder } from '../types';
import type { ModuleId } from '../App';
import './DashboardModule.css';

interface Props {
  onNavigate: (module: ModuleId) => void;
}

const LOW_STOCK_THRESHOLD = 2;
const PERIODS = [{ id: 3, label: '3M' }, { id: 6, label: '6M' }, { id: 12, label: '12M' }] as const;
type PeriodMonths = (typeof PERIODS)[number]['id'];

interface LowStockRow {
  id: string;
  po: string;
  itemName: string;
  modelPart: string;
  supplyCompany: string;
  stock: number;
  total: number;
}

/**
 * Pantalla de inicio: resumen operativo del día. Todo sale de DataProvider (sin fetch propio).
 */
export default function DashboardModule({ onNavigate }: Props) {
  const { jobOrders, jobProducts, entrances, usage, destinations, isLoading } = useAppData();
  const { currentUser, hasPermission } = useAuth();
  const { company } = useCompany();
  const authorName = useAuthorName();
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const today = getTodayString();
  const thisMonth = today.slice(0, 7);
  const [period, setPeriod] = useState<PeriodMonths>(6);
  const [variant, setVariant] = useChartVariant('dashboard_orders');

  const stats = useMemo(() => {
    const active = jobOrders.filter(o => o.workFinish === 'NO');
    const overdue = active.filter(o => o.schedule && o.schedule < today);
    const dueToday = active.filter(o => o.schedule === today);
    const unscheduled = active.filter(o => !o.schedule);
    const agenda = active
      .filter(o => o.schedule)
      .sort((a, b) => a.schedule.localeCompare(b.schedule))
      .slice(0, 12);

    const months = lastMonths(today, period);
    const perMonth = new Map<string, MonthlyPoint>(months.map(k => [k, { month: k, finished: 0, open: 0 }]));
    for (const o of jobOrders) {
      const point = perMonth.get(monthKey(o.createdAt));
      if (!point) continue;
      if (o.workFinish === 'YES') point.finished = Number(point.finished) + 1;
      else point.open = Number(point.open) + 1;
    }
    const createdThisMonth = jobOrders.filter(o => monthKey(o.createdAt) === thisMonth).length;
    const createdLastMonth = jobOrders.filter(o => monthKey(o.createdAt) === months[months.length - 2]).length;
    const finishedThisMonth = jobOrders.filter(o => o.workFinish === 'YES' && monthKey(o.createdAt) === thisMonth).length;

    let stockAvailable = 0;
    let stockTotal = 0;
    let stockValue = 0;
    let receivedValue = 0;
    const lowStock: LowStockRow[] = [];
    for (const e of entrances) {
      for (const d of e.details) {
        const stock = getDetailStock(d, usage);
        stockTotal += d.itemsArrived || 0;
        if (stock > 0) stockAvailable += stock;
        stockValue += Math.max(0, stock) * (d.price ?? 0);
        receivedValue += (d.itemsArrived || 0) * (d.price ?? 0);
        if (stock <= LOW_STOCK_THRESHOLD) {
          lowStock.push({ id: `${e.id}-${d.detailId}`, po: e.po, itemName: d.itemName, modelPart: d.modelPart, supplyCompany: e.supplyCompany, stock, total: d.itemsArrived });
        }
      }
    }
    lowStock.sort((a, b) => a.stock - b.stock);

    const properties = new Set(destinations.map(d => d.property).filter(Boolean)).size;
    const topAddresses = countBy(jobOrders, o => o.destination || '(no address)').map(([name, value]) => ({ name, value }));

    // Gráficas movidas desde Reports (sin filtros: totales de toda la operación)
    const propertyOf = new Map(destinations.map(d => [d.description, d.property || '']));
    const byProperty = countBy(jobOrders, o => propertyOf.get(o.destination) || 'Other / unknown').map(([name, value]) => ({ name, value }));
    const byUser = countBy(jobOrders, o => o.jobOrder || 'Unassigned').map(([name, value]) => ({ name, value }));
    const itemsByName = countBy(jobProducts, pr => pr.itemName || '(no name)', pr => pr.quantity).map(([name, value]) => ({ name, value }));
    const poChart = [...entrances]
      .sort((a, b) => (b.po || '').localeCompare(a.po || ''))
      .slice(0, 8)
      .reverse()
      .map(e => { const { total, stock } = getEntranceStock(e, usage); return { month: e.po || '(no PO)', received: total, installed: total - stock }; });

    return {
      active, overdue, dueToday, unscheduled, agenda, monthly: [...perMonth.values()],
      createdThisMonth, createdLastMonth, finishedThisMonth, stockAvailable, stockTotal, stockValue, receivedValue, lowStock, properties, topAddresses,
      byProperty, byUser, itemsByName, poChart,
      periodOrders: jobOrders.filter(o => months.includes(monthKey(o.createdAt))).length,
    };
  }, [jobOrders, jobProducts, entrances, usage, destinations, today, thisMonth, period]);

  const agendaColumns = useMemo<DataColumn<JobOrder>[]>(() => [
    { id: 'seq', header: '#', value: o => o.visualSeq ?? null, type: 'number', align: 'center', width: '60px', hideable: false, render: o => <SeqBadge seq={o.visualSeq} /> },
    { id: 'schedule', header: 'Schedule', value: o => o.schedule, type: 'date', nowrap: true, render: o => <ScheduleCell date={o.schedule} /> },
    { id: 'destination', header: 'Address', value: o => o.destination, render: o => <span className="cell-strong">{o.destination}</span> },
    { id: 'description', header: 'Description', value: o => o.description, render: o => <span className="cell-clamp" title={o.description}>{o.description}</span> },
    { id: 'jobOrder', header: 'Ordered by', value: o => o.jobOrder || '', render: o => o.jobOrder || <span className="badge neutral">—</span> },
    { id: 'pendingWork', header: 'Notes', value: o => o.pendingWork || '', align: 'center', sortable: false, render: o => <NotesCell text={o.pendingWork} title={`Pending work — Order ${formatSeq(o.visualSeq)}`} subtitle={`${o.destination} · ${o.description}`} /> },
  ], []);

  const lowStockColumns = useMemo<DataColumn<LowStockRow>[]>(() => [
    { id: 'po', header: 'PO #', value: r => r.po, nowrap: true, render: r => <span className="cell-strong text-primary cell-mono">{r.po || '—'}</span> },
    { id: 'itemName', header: 'Item', value: r => r.itemName, render: r => <span className="cell-strong">{r.itemName}</span> },
    { id: 'modelPart', header: 'Model', value: r => r.modelPart },
    { id: 'supplyCompany', header: 'Supplier', value: r => r.supplyCompany, defaultHidden: true },
    { id: 'stock', header: 'Stock', value: r => r.stock, type: 'number', align: 'center', render: r => <StockLevel stock={r.stock} total={r.total} /> },
  ], []);

  const statusSlices = [
    { name: 'Finished', value: jobOrders.length - stats.active.length, color: COLOR_SUCCESS },
    { name: 'In progress', value: stats.active.length - stats.overdue.length, color: COLOR_PRIMARY },
    { name: 'Overdue', value: stats.overdue.length, color: COLOR_DANGER },
  ];

  const handleExportPdf = async () => {
    setIsPdfBusy(true);
    try {
      const pdf = await import('../utils/pdf');
      const doc = pdf.createDoc();
      let y = pdf.brandHeader(doc, company, 'Operations Dashboard', `Snapshot of ${formatDateDisplay(today)} — full operation, all time`, authorName);
      y = pdf.kpiStrip(doc, y, [
        { label: 'Active orders', value: String(stats.active.length), note: `${stats.unscheduled.length} without a schedule`, color: pdf.PDF_COLORS.PRIMARY },
        { label: 'Due today', value: String(stats.dueToday.length), color: pdf.PDF_COLORS.PURPLE },
        { label: 'Overdue', value: String(stats.overdue.length), color: stats.overdue.length > 0 ? pdf.PDF_COLORS.RED : pdf.PDF_COLORS.GREEN },
        { label: 'Orders this month', value: String(stats.createdThisMonth), note: `${stats.createdThisMonth - stats.createdLastMonth >= 0 ? '+' : ''}${stats.createdThisMonth - stats.createdLastMonth} vs last month`, color: pdf.PDF_COLORS.SLATE },
        { label: 'Units in stock', value: String(stats.stockAvailable), note: `${stats.lowStock.length} low stock`, color: pdf.PDF_COLORS.ORANGE },
        { label: 'Inventory value', value: formatCurrency(stats.stockValue), note: `of ${formatCurrency(stats.receivedValue)} received`, color: pdf.PDF_COLORS.GREEN },
      ]);

      const captures = await Promise.all([
        pdf.captureChart('dash_orders'), pdf.captureChart('dash_status'), pdf.captureChart('dash_items'),
        pdf.captureChart('dash_property'), pdf.captureChart('dash_users'), pdf.captureChart('dash_po'), pdf.captureChart('dash_addresses'),
      ]);
      const [orders, status, items, property, users, po, addresses] = captures;
      const total = jobOrders.length;
      const pct = (v: number) => (total ? ` (${Math.round((v / total) * 100)}%)` : '');
      const toLegend = (slices: { name: string; value: number; color: string }[], sum: number) =>
        slices.map(s => ({ color: s.color, label: s.name, value: `${s.value}${sum ? ` · ${Math.round((s.value / sum) * 100)}%` : ''}` }));
      const itemSlices = donutSlices(stats.itemsByName);
      const propertySlices = donutSlices(stats.byProperty);
      const charts = [
        orders && { title: `Orders — last ${period} months`, image: orders, wide: true, legend: [
          { color: COLOR_SUCCESS, label: 'Finished' }, { color: COLOR_PRIMARY, label: 'Open' },
        ] },
        status && { title: 'Order status', image: status, legend: statusSlices.map(s => ({ color: s.color, label: s.name, value: `${s.value}${pct(s.value)}` })) },
        items && { title: 'Items installed by product', image: items, legend: toLegend(itemSlices, itemSlices.reduce((s, d) => s + d.value, 0)) },
        property && { title: 'Work by property', image: property, legend: toLegend(propertySlices, propertySlices.reduce((s, d) => s + d.value, 0)) },
        users && { title: 'Orders per account user', image: users },
        po && { title: 'Received vs installed by PO', image: po, wide: true, legend: [
          { color: COLOR_PRIMARY, label: 'Received' }, { color: COLOR_WARNING, label: 'Installed' },
        ] },
        addresses && { title: 'Most visited addresses', image: addresses },
      ].filter(Boolean) as import('../utils/pdf').ChartImage[];
      if (charts.length > 0) {
        y = pdf.ensureSpace(doc, y, 200);
        y = pdf.sectionTitle(doc, y, 'Trends & analytics');
        y = pdf.chartGrid(doc, y + 4, charts);
      }

      y = pdf.ensureSpace(doc, y, 140);
      y = pdf.sectionTitle(doc, y, `Agenda — upcoming & overdue (${stats.agenda.length})`);
      y = pdf.drawTable(doc, y + 6,
        ['#', 'Schedule', 'Address', 'Description', 'Ordered by', 'Pending work'],
        stats.agenda.map(o => [formatSeq(o.visualSeq), o.schedule ? formatDateDisplay(o.schedule) : '—', o.destination, o.description, o.jobOrder || '—', o.pendingWork || '—']),
        { didParseCell: (data) => { const row = stats.agenda[data.row.index]; if (data.section === 'body' && row && row.schedule < today) data.cell.styles.textColor = pdf.PDF_COLORS.RED; } });

      if (stats.lowStock.length > 0) {
        y = pdf.ensureSpace(doc, y, 140);
        y = pdf.sectionTitle(doc, y, `Low stock alerts (${stats.lowStock.length})`, pdf.PDF_COLORS.ORANGE);
        pdf.drawTable(doc, y + 6,
          ['PO #', 'Item', 'Model', 'Supplier', 'Stock', 'Received'],
          stats.lowStock.map(r => [r.po || '—', r.itemName, r.modelPart, r.supplyCompany, r.stock, r.total]),
          { columnStyles: { 4: { halign: 'center', fontStyle: 'bold' }, 5: { halign: 'center' } }, tableWidth: 520 });
      }

      pdf.addFooters(doc, company, 'Operations Dashboard');
      doc.save(`dashboard-${today}.pdf`);
      AuditLogger.log({ action: 'EXPORT', module: 'Dashboard (PDF)', user: authorName, details: 'Dashboard PDF generated' });
    } catch (err) {
      console.error('PDF export failed', err);
      alert('Could not generate the PDF. Please try again.');
    } finally {
      setIsPdfBusy(false);
    }
  };

  if (isLoading) return <LoadingScreen message="Loading dashboard..." />;

  const canWork = hasPermission('view_work_activity');
  const canAddWork = hasPermission('add_work_activity');
  const canStock = hasPermission('view_item_entrance');
  const canAddStock = hasPermission('add_item_entrance');
  const canCatalogs = hasPermission('view_catalogs');
  const canReports = hasPermission('view_reports');

  const stockPct = stats.stockTotal > 0 ? Math.round((stats.stockAvailable / stats.stockTotal) * 100) : 0;

  return (
    <div className="card max-1400 catalog-manager-anim">
      <div className="card-header wrap">
        <div className="card-header-text module-header-title">
          <h2><LayoutDashboard size={28} /> Dashboard</h2>
          <p>Welcome back, {currentUser?.firstName || currentUser?.username}. Here is today&apos;s overview ({formatDateDisplay(today)}).</p>
        </div>
        <div className="quick-actions">
          {canAddWork && <button type="button" className="action btn-primary btn-sm" onClick={() => onNavigate('workActivity')}><Plus size={16} /> New Order</button>}
          {canAddStock && <button type="button" className="action btn-secondary btn-sm" onClick={() => onNavigate('itemEntrance')}><PackageSearch size={16} /> New PO</button>}
          {canCatalogs && <button type="button" className="action btn-secondary btn-sm" onClick={() => onNavigate('catalogs')}><FileSpreadsheet size={16} /> Import addresses</button>}
          {canReports && <button type="button" className="action btn-secondary btn-sm" onClick={() => onNavigate('reports')}><BarChart2 size={16} /> Reports</button>}
          {hasPermission('export_reports') && (
            <button type="button" className="action btn-secondary btn-sm" onClick={handleExportPdf} disabled={isPdfBusy} title="Download this dashboard as a management-ready PDF">
              <FileText size={16} /> {isPdfBusy ? 'Generating...' : 'Export PDF'}
            </button>
          )}
        </div>
      </div>

      <div className="kpi-grid cols-4">
        <KpiCard icon={<Briefcase size={20} />} label="Active Orders" value={stats.active.length} tone="blue" note={`${stats.unscheduled.length} without a schedule`} onClick={canWork ? () => onNavigate('workActivity') : undefined} />
        <KpiCard icon={<CalendarClock size={20} />} label="Due Today" value={stats.dueToday.length} tone="purple" note={stats.dueToday.length === 0 ? 'Nothing scheduled for today' : 'Scheduled for today'} />
        <KpiCard icon={<AlertTriangle size={20} />} label="Overdue" value={stats.overdue.length} tone={stats.overdue.length > 0 ? 'red' : 'green'} note={stats.overdue.length > 0 ? 'Scheduled before today, not finished' : 'Everything is on time'} />
        <KpiCard icon={<CheckCircle2 size={20} />} label="Orders this month" value={stats.createdThisMonth} tone="cyan" trend={{ delta: stats.createdThisMonth - stats.createdLastMonth, label: 'vs last month' }} />
      </div>
      <div className="kpi-grid cols-3">
        <KpiCard icon={<Boxes size={20} />} label="Units in Stock" value={stats.stockAvailable} tone={stats.lowStock.length > 0 ? 'orange' : 'green'} note={`${stockPct}% of received · ${stats.lowStock.length} low`} onClick={canStock ? () => onNavigate('itemEntrance') : undefined} />
        <KpiCard icon={<DollarSign size={20} />} label="Inventory value" value={formatCurrency(stats.stockValue)} tone="green" note={stats.receivedValue > 0 ? `of ${formatCurrency(stats.receivedValue)} received` : 'Add unit prices to POs to track value'} onClick={canStock ? () => onNavigate('itemEntrance') : undefined} />
        <KpiCard icon={<MapPin size={20} />} label="Addresses" value={destinations.length} tone="slate" note={`${stats.properties} propert${stats.properties === 1 ? 'y' : 'ies'}`} onClick={canCatalogs ? () => onNavigate('catalogs') : undefined} />
      </div>

      <div className="section-head">
        <span className="section-icon"><Clock size={18} /></span>
        <div>
          <h3>Today&apos;s work</h3>
          <p>Upcoming and overdue orders, and products running low.</p>
        </div>
      </div>
      <div className="dash-grid">
        <section className="dash-panel">
          <header className="dash-panel-head">
            <span className="section-icon"><Clock size={18} /></span>
            <div className="flex-1">
              <h3>Agenda — upcoming &amp; overdue</h3>
              <p>Active orders sorted by schedule date. Overdue rows are marked in red.</p>
            </div>
            {canWork && (
              <button type="button" className="btn-link flex-row" onClick={() => onNavigate('workActivity')}>
                Open <ArrowRight size={14} />
              </button>
            )}
          </header>
          <DataTable<JobOrder>
            columns={agendaColumns}
            rows={stats.agenda}
            rowKey={o => o.id}
            pageSize={0}
            hideToolbar
            compact
            rowClassName={o => (o.schedule < today ? 'overdue' : o.schedule === today ? 'warn' : undefined)}
            onRowClick={canWork ? () => onNavigate('workActivity') : undefined}
            emptyMessage="No active orders with a schedule."
          />
        </section>

        <section className="dash-panel">
          <header className="dash-panel-head">
            <span className="section-icon warn"><Boxes size={18} /></span>
            <div className="flex-1">
              <h3>Low stock alerts</h3>
              <p>Products with {LOW_STOCK_THRESHOLD} units or fewer remaining.</p>
            </div>
            {canStock && (
              <button type="button" className="btn-link flex-row" onClick={() => onNavigate('itemEntrance')}>
                Inventory <ArrowRight size={14} />
              </button>
            )}
          </header>
          <DataTable<LowStockRow>
            columns={lowStockColumns}
            rows={stats.lowStock.slice(0, 12)}
            rowKey={r => r.id}
            pageSize={0}
            hideToolbar
            compact
            emptyMessage="All products have stock."
          />
        </section>

      </div>

      <div className="section-head">
        <span className="section-icon"><BarChart2 size={18} /></span>
        <div>
          <h3>Trends &amp; analytics</h3>
          <p>Full operation, all time. Use Reports to filter by date, address or user.</p>
        </div>
      </div>
      <div className="chart-grid">
        <ChartCard
          title={`Orders — last ${period} months`}
          chartId="dash_orders"
          subtitle={`${stats.periodOrders} orders registered in the period, by status`}
          icon={<TrendingUp size={16} />}
          wide
          empty={jobOrders.length === 0}
          actions={
            <>
              <div className="chip-group compact" role="group" aria-label="Period">
                {PERIODS.map(p => <button key={p.id} type="button" className={`chip${period === p.id ? ' active' : ''}`} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}>{p.label}</button>)}
              </div>
              <ChartTypeToggle value={variant} onChange={setVariant} />
            </>
          }
        >
          <MonthlyBars data={stats.monthly} variant={variant} series={[{ key: 'finished', name: 'Finished', color: COLOR_SUCCESS }, { key: 'open', name: 'Open', color: COLOR_PRIMARY }]} />
        </ChartCard>
        <ChartCard chartId="dash_status" title="Order status" subtitle={`${stats.finishedThisMonth} finished this month`} icon={<PieIcon size={16} />} empty={jobOrders.length === 0}>
          <DonutChart data={statusSlices} centerLabel="Orders" />
        </ChartCard>
        <ChartCard chartId="dash_items" title="Items installed by product" subtitle="Units consumed per item name" icon={<Wrench size={16} />} empty={stats.itemsByName.length === 0}>
          <DonutChart data={stats.itemsByName} centerLabel="Units" />
        </ChartCard>
        <ChartCard chartId="dash_property" title="Work by property" subtitle="Orders per apartment complex" icon={<Building2 size={16} />} empty={stats.byProperty.length === 0}>
          <DonutChart data={stats.byProperty} centerLabel="Orders" />
        </ChartCard>
        <ChartCard chartId="dash_users" title="Orders per account user" subtitle="Who ordered the work" icon={<Award size={16} />} empty={stats.byUser.length === 0}>
          <RankBars data={stats.byUser} valueName="Orders" multicolor />
        </ChartCard>
        <ChartCard chartId="dash_po" title="Received vs installed by PO" subtitle="Latest purchase orders" icon={<FileBarChart size={16} />} wide empty={stats.poChart.length === 0}>
          <MonthlyBars data={stats.poChart} stacked={false} xFormatter={v => v} series={[{ key: 'received', name: 'Received', color: COLOR_PRIMARY }, { key: 'installed', name: 'Installed', color: COLOR_WARNING }]} />
        </ChartCard>
        <ChartCard chartId="dash_addresses" title="Most visited addresses" subtitle="All-time interventions" icon={<MapPin size={16} />} empty={stats.topAddresses.length === 0}>
          <RankBars data={stats.topAddresses} valueName="Orders" max={8} />
        </ChartCard>
      </div>

    </div>
  );
}
