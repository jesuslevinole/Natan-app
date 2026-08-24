import { useState, useMemo, useCallback, type FormEvent, type MouseEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { PackageSearch, Plus, X, Settings, Edit2, Trash2, Maximize2, Lock } from 'lucide-react';
import type { NormalizedEntrance, ItemEntranceFormData, EntranceDetail } from '../types';
import Modal from '../components/Modal';
import ModuleHeader from '../components/ModuleHeader';
import SeqBadge from '../components/SeqBadge';
import SearchableSelect from '../components/SearchableSelect';
import SearchBar from '../components/SearchBar';
import FieldSecurityModal from '../components/FieldSecurityModal';
import LoadingScreen from '../components/LoadingScreen';
import { StockBadge, StockLevel } from '../components/StatusBadge';
import DataTable, { type DataColumn } from '../components/DataTable';
import { useFormConfig, useFieldRoles } from '../hooks/useAppHooks';
import { useAppData } from '../hooks/useAppData';
import { getTodayString, formatDateDisplay, matchesSearch } from '../utils/helpers';
import { getDetailStock, getEntranceStock } from '../utils/entrance';
import { nextSequence, formatPONumber } from '../utils/firestore';
import { AuditLogger } from '../utils/logger';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import RequirePermission from '../components/RequirePermission';

type StockFilter = 'ALL' | 'AVAILABLE' | 'UNAVAILABLE';

const HEADER_FIELDS = [
  { name: 'date', label: 'Date (Registration)' },
  { name: 'supplyCompany', label: 'Supply Company' },
  { name: 'po', label: 'PO #' },
];
const DETAIL_FIELDS = [
  { name: 'itemName', label: 'Item Name' },
  { name: 'modelPart', label: 'Model / Part #' },
  { name: 'serial', label: 'Serial #' },
  { name: 'orderDate', label: 'Arrived Date' },
  { name: 'itemsArrived', label: 'Items Arrived' },
];

const generateDetailId = () => `det_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const emptyDetail: EntranceDetail = { detailId: '', itemName: '', modelPart: '', serial: '', orderDate: '', itemsArrived: 0 };

const initialForm = (): ItemEntranceFormData => ({
  date: getTodayString(), po: '', supplyCompany: '', details: [],
});

export default function ItemEntranceModule() {
  const { currentUser } = useAuth();
  const authorName = useAuthorName();
  const { entrances, jobProducts, jobOrders, usage, roles, supplyCompanies, itemNames, isLoading } = useAppData();

  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isExpandHistoryOpen, setIsExpandHistoryOpen] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedHistoryDetailId, setSelectedHistoryDetailId] = useState<string | null>(null);

  const { toggleRequired: toggleItemReq, isRequired: isItemReq } = useFormConfig('itemEntrance', ['date', 'supplyCompany', 'po']);
  const { toggleRequired: toggleDetailReq, isRequired: isDetailReq } = useFormConfig('itemEntranceDetail', ['itemName', 'itemsArrived']);
  const { fieldRoles, setFieldRole } = useFieldRoles('itemEntrance_fieldRoles');

  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);
  const [detailDraft, setDetailDraft] = useState<EntranceDetail>(emptyDetail);
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);

  const isFieldEditable = useCallback((fieldName: string) => {
    if (isProcessing) return false;
    if (currentUser?.roleId === 'admin_role') return true;
    const requiredRole = fieldRoles[fieldName];
    return !requiredRole || currentUser?.roleId === requiredRole;
  }, [isProcessing, currentUser, fieldRoles]);

  const companyOptions = useMemo(
    () => supplyCompanies.filter(c => c.company).map(c => ({ id: c.company, label: c.company })),
    [supplyCompanies],
  );
  const itemNameOptions = useMemo(
    () => itemNames.filter(i => i.item_name).map(i => ({ id: i.item_name, label: i.item_name, sublabel: i.category || undefined })),
    [itemNames],
  );

  const orderById = useMemo(() => new Map(jobOrders.map(o => [o.id, o])), [jobOrders]);

  // Historial de instalación del PO en edición (o del detalle seleccionado).
  const itemHistory = useMemo(() => {
    if (!editingId) return [];
    const details = formData.details ?? [];
    const detailIds = new Set(details.map(d => d.detailId));
    return jobProducts
      .filter(p => selectedHistoryDetailId
        ? p.entranceDetailId === selectedHistoryDetailId
        : p.itemEntranceId === editingId || (p.entranceDetailId !== undefined && detailIds.has(p.entranceDetailId)))
      .map(p => {
        const order = orderById.get(p.jobOrderId);
        const matched = details.find(d => d.detailId === p.entranceDetailId);
        return {
          id: p.id ?? `${p.jobOrderId}-${p.entranceDetailId}`,
          quantity: p.quantity,
          jobOrder: order?.jobOrder || 'Unknown',
          destination: order?.destination || 'Unknown',
          date: order?.createdAt || '',
          itemName: matched?.itemName || p.itemName || '',
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [editingId, formData.details, jobProducts, selectedHistoryDetailId, orderById]);

  const filteredHistory = useMemo(
    () => itemHistory.filter(h => matchesSearch(historySearchTerm, h.jobOrder, h.destination, h.itemName, formatDateDisplay(h.date))),
    [itemHistory, historySearchTerm],
  );

  const handleOpenModal = async (item: NormalizedEntrance | null) => {
    if (item) {
      setEditingId(item.id);
      setFormData({ date: item.date || '', po: item.po || '', supplyCompany: item.supplyCompany || '', details: item.details });
    } else {
      setEditingId(null);
      // Pre-generamos el PO consecutivo (PO000, PO001, ...) al abrir el modal de creación.
      try {
        const n = await nextSequence('poSeq', 0);
        setFormData({ ...initialForm(), po: formatPONumber(n) });
      } catch (err) {
        console.error('Error generating PO sequence:', err);
        setFormData(initialForm());
      }
    }
    setDetailDraft(emptyDetail);
    setEditingDetailId(null);
    setSelectedHistoryDetailId(null);
    setIsModalOpen(true);
  };

  const handleAddOrUpdateDetail = () => {
    if (!detailDraft.itemName.trim()) { alert('Item Name is required for each product.'); return; }
    if (!detailDraft.itemsArrived || detailDraft.itemsArrived <= 0) { alert('Items Arrived must be greater than 0.'); return; }
    if (editingDetailId) {
      setFormData(prev => ({
        ...prev,
        details: (prev.details ?? []).map(d => (d.detailId === editingDetailId ? { ...detailDraft, detailId: editingDetailId } : d)),
      }));
      setEditingDetailId(null);
    } else {
      setFormData(prev => ({ ...prev, details: [...(prev.details ?? []), { ...detailDraft, detailId: generateDetailId() }] }));
    }
    setDetailDraft(emptyDetail);
  };

  const handleEditDetail = (detail: EntranceDetail) => {
    setDetailDraft({ ...detail });
    setEditingDetailId(detail.detailId);
  };

  const handleRemoveDetail = (detail: EntranceDetail) => {
    if ((usage.get(detail.detailId) || 0) > 0) {
      alert('Cannot remove this product: it has already been used in one or more job orders.');
      return;
    }
    if (!window.confirm(`Remove ${detail.itemName} from the PO?`)) return;
    setFormData(prev => ({ ...prev, details: (prev.details ?? []).filter(d => d.detailId !== detail.detailId) }));
    if (editingDetailId === detail.detailId) { setEditingDetailId(null); setDetailDraft(emptyDetail); }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const details = formData.details ?? [];
    if (details.length === 0) { alert('Please add at least one product before saving.'); return; }
    setIsProcessing(true);
    try {
      const first = details[0];
      // Header + details. Los campos legacy se rellenan con el primer detalle para no romper
      // registros/vistas antiguas que aún los leen directamente.
      const payload = {
        date: formData.date,
        supplyCompany: formData.supplyCompany,
        po: formData.po,
        details,
        itemName: first.itemName || '',
        modelPart: first.modelPart || '',
        serial: first.serial || '',
        orderDate: first.orderDate || '',
        itemsArrived: details.reduce((sum, d) => sum + (d.itemsArrived || 0), 0),
      };
      if (editingId) {
        await updateDoc(doc(db, 'itemEntrance', editingId), payload);
        AuditLogger.logUpdate('Item Entrance', authorName, editingId, payload);
      } else {
        const seq = await nextSequence('itemEntranceSeq');
        const docRef = await addDoc(collection(db, 'itemEntrance'), { ...payload, seq, createdAt: new Date().toISOString() });
        AuditLogger.logCreate('Item Entrance', authorName, docRef.id, payload);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving data', error);
      alert('Error saving record.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteEntrance = async (item: NormalizedEntrance, e?: MouseEvent) => {
    e?.stopPropagation();
    const { total, stock } = getEntranceStock(item, usage);
    if (stock < total) {
      alert('This PO has products already installed in job orders and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete PO ${item.po} permanently?`)) return;
    await deleteDoc(doc(db, 'itemEntrance', item.id));
    AuditLogger.logDelete('Item Entrance', authorName, item.id, item);
  };

  const filteredItems = useMemo(() => entrances.filter(item => {
    const { stock } = getEntranceStock(item, usage);
    if (stockFilter === 'AVAILABLE' && stock <= 0) return false;
    if (stockFilter === 'UNAVAILABLE' && stock > 0) return false;
    return matchesSearch(
      searchTerm, item.po, item.supplyCompany, formatDateDisplay(item.date),
      ...item.details.flatMap(d => [d.itemName, d.modelPart, d.serial]),
    );
  }), [entrances, usage, stockFilter, searchTerm]);

  const entranceColumns = useMemo<DataColumn<NormalizedEntrance>[]>(() => [
    { id: 'seq', header: '#', value: i => i.visualSeq ?? i.seq ?? null, type: 'number', align: 'center', width: '70px', hideable: false, render: i => <SeqBadge seq={i.visualSeq} /> },
    { id: 'status', header: 'Status', value: i => (getEntranceStock(i, usage).stock > 0 ? 'AVAILABLE' : 'UNAVAILABLE'), align: 'center', render: i => <StockBadge available={getEntranceStock(i, usage).stock > 0} /> },
    { id: 'date', header: 'Date', value: i => i.date, type: 'date', nowrap: true, render: i => formatDateDisplay(i.date) },
    { id: 'po', header: 'PO #', value: i => i.po, nowrap: true, render: i => <span className="cell-strong text-primary cell-mono">{i.po || '—'}</span> },
    { id: 'supplyCompany', header: 'Supply Company', value: i => i.supplyCompany, render: i => <span className="cell-strong">{i.supplyCompany || '—'}</span> },
    { id: 'products', header: 'Products', value: i => i.details.length, type: 'number', align: 'center' },
    { id: 'received', header: 'Received', value: i => getEntranceStock(i, usage).total, type: 'number', align: 'center' },
    { id: 'stock', header: 'In Stock', value: i => getEntranceStock(i, usage).stock, type: 'number', align: 'center',
      render: i => { const { stock, total } = getEntranceStock(i, usage); return <StockLevel stock={stock} total={total} />; } },
  ], [usage]);

  const detailColumns = useMemo<DataColumn<EntranceDetail>[]>(() => [
    { id: 'itemName', header: 'Item Name', value: d => d.itemName, render: d => <span className="cell-strong">{d.itemName}</span> },
    { id: 'modelPart', header: 'Model / Part #', value: d => d.modelPart },
    { id: 'serial', header: 'Serial #', value: d => d.serial, render: d => d.serial ? <span className="cell-mono">{d.serial}</span> : <span className="dt-dash">—</span> },
    { id: 'orderDate', header: 'Arrived', value: d => d.orderDate, type: 'date', nowrap: true, render: d => d.orderDate ? formatDateDisplay(d.orderDate) : '—' },
    { id: 'stock', header: 'Stock', value: d => getDetailStock(d, usage), type: 'number', align: 'center', render: d => <StockLevel stock={getDetailStock(d, usage)} total={d.itemsArrived} /> },
  ], [usage]);

  const lockHint = (field: string) => !isFieldEditable(field) && <span className="lock-hint"><Lock size={12} /> Locked</span>;

  const formDetailColumns = useMemo<DataColumn<EntranceDetail>[]>(() => [
    { id: 'itemName', header: 'Item Name', value: d => d.itemName, render: d => <span className="cell-strong">{d.itemName}</span> },
    { id: 'modelPart', header: 'Model / Part #', value: d => d.modelPart },
    { id: 'serial', header: 'Serial #', value: d => d.serial, render: d => d.serial ? <span className="cell-mono">{d.serial}</span> : <span className="dt-dash">—</span> },
    { id: 'orderDate', header: 'Arrived', value: d => d.orderDate, type: 'date', nowrap: true, render: d => d.orderDate ? formatDateDisplay(d.orderDate) : '—' },
    { id: 'stock', header: 'Stock', value: d => (editingId ? getDetailStock(d, usage) : d.itemsArrived), type: 'number', align: 'center',
      render: d => <StockLevel stock={editingId ? getDetailStock(d, usage) : d.itemsArrived} total={d.itemsArrived} /> },
  ], [editingId, usage]);

  type HistoryRow = (typeof itemHistory)[number];
  const historyColumns = useMemo<DataColumn<HistoryRow>[]>(() => [
    { id: 'date', header: 'Date', value: h => h.date, type: 'date', nowrap: true, render: h => formatDateDisplay(h.date) },
    { id: 'itemName', header: 'Product', value: h => h.itemName, render: h => <span className="cell-strong">{h.itemName || '—'}</span> },
    { id: 'jobOrder', header: 'Ordered By', value: h => h.jobOrder, render: h => <span className="cell-strong">{h.jobOrder}</span> },
    { id: 'destination', header: 'Address', value: h => h.destination },
    { id: 'quantity', header: 'Qty Used', value: h => h.quantity, type: 'number', align: 'center', render: h => <span className="fw-bold text-danger">-{h.quantity}</span> },
  ], []);
  const historyTable = (rows: HistoryRow[], emptyText: string, paginate = false) => (
    <DataTable<HistoryRow> columns={historyColumns} rows={rows} rowKey={h => h.id} pageSize={paginate ? 10 : 0} hideToolbar={!paginate} compact emptyMessage={emptyText} />
  );

  if (isLoading) return <LoadingScreen message="Loading inventory..." />;

  return (
    <div className="card">
      <ModuleHeader
        icon={<PackageSearch size={24} />}
        title="Item Entrance"
        subtitle="Register incoming products by PO"
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        filters={
          <div className="chip-group" role="group" aria-label="Stock filter">
            <button type="button" className={`chip${stockFilter === 'ALL' ? ' active' : ''}`} onClick={() => setStockFilter('ALL')}>All</button>
            <button type="button" className={`chip success${stockFilter === 'AVAILABLE' ? ' active' : ''}`} onClick={() => setStockFilter('AVAILABLE')}>Available</button>
            <button type="button" className={`chip danger${stockFilter === 'UNAVAILABLE' ? ' active' : ''}`} onClick={() => setStockFilter('UNAVAILABLE')}>Unavailable</button>
          </div>
        }
        actions={
          <RequirePermission permission="add_item_entrance">
            <button type="button" className="action btn-primary btn-header" onClick={() => handleOpenModal(null)}>
              <Plus size={18} /> New Entrance
            </button>
          </RequirePermission>
        }
      />

      <DataTable<NormalizedEntrance>
        columns={entranceColumns}
        rows={filteredItems}
        rowKey={item => item.id}
        storageKey="item_entrance"
        onRowClick={item => handleOpenModal(item)}
        initialSort={{ id: 'seq', dir: 'desc' }}
        emptyMessage="No purchase orders registered yet."
        renderExpanded={item => (
          <DataTable<EntranceDetail>
            columns={detailColumns}
            rows={item.details}
            rowKey={d => d.detailId}
            pageSize={0}
            hideToolbar
            compact
            emptyMessage="This PO has no products."
          />
        )}
        actions={item => (
          <>
            <RequirePermission permission="edit_item_entrance">
              <button type="button" className="icon-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }} title="Edit Record"><Edit2 size={16} /></button>
            </RequirePermission>
            <RequirePermission permission="delete_item_entrance">
              <button type="button" className="icon-btn delete" onClick={(e) => handleDeleteEntrance(item, e)} title="Delete Record"><Trash2 size={16} /></button>
            </RequirePermission>
          </>
        )}
      />

      <FieldSecurityModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        roles={roles}
        groups={[
          { title: 'PO Header Fields', fields: HEADER_FIELDS, isRequired: isItemReq, toggleRequired: toggleItemReq, fieldRoles, setFieldRole },
          { title: 'Product Detail Fields', fields: DETAIL_FIELDS, isRequired: isDetailReq, toggleRequired: toggleDetailReq },
        ]}
      />

      {isModalOpen && (
        <Modal
          size="large"
          title={editingId ? 'Edit Entrance' : 'New Entrance'}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSave}
          actions={
            <>
              <RequirePermission permission="manage_security">
                <button type="button" className="icon-btn" onClick={() => setIsConfigOpen(true)} title="Configure Field Security"><Settings size={20} /></button>
              </RequirePermission>
              <button type="submit" className="action btn-primary" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save Changes'}</button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-group">
              <label>Date (Registration) {isItemReq('date') && '*'} {lockHint('date')}</label>
              <input type="date" className={isFieldEditable('date') ? undefined : 'locked'} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required={isItemReq('date')} disabled={!isFieldEditable('date')} />
            </div>
            <div className="form-group">
              <label>Supply Company {isItemReq('supplyCompany') && '*'} {lockHint('supplyCompany')}</label>
              <div className={isFieldEditable('supplyCompany') ? undefined : 'field-locked-wrap'}>
                <SearchableSelect options={companyOptions} value={formData.supplyCompany} onChange={(id) => setFormData({ ...formData, supplyCompany: id })} placeholder="-- Select Company --" required={isItemReq('supplyCompany')} />
              </div>
            </div>
            <div className="form-group">
              <label className="label-primary">PO # {isItemReq('po') && '*'} <span className="label-note">(auto-generated)</span></label>
              <input type="text" className="readonly-po" value={formData.po} readOnly />
            </div>
          </div>

          <div className="section-divider">
            <div className="section-heading">
              <div>
                <h4>Products in this PO</h4>
                <p>Add one or more products to this Purchase Order</p>
              </div>
              <span className="text-sm text-muted">Total products: <strong>{(formData.details ?? []).length}</strong></span>
            </div>

            <div className="inline-form-box">
              <div className="form-grid">
                <div className="form-group">
                  <label>Item Name {isDetailReq('itemName') && '*'}</label>
                  <SearchableSelect options={itemNameOptions} value={detailDraft.itemName} onChange={(val) => setDetailDraft({ ...detailDraft, itemName: val })} placeholder="-- Search from Catalog --" />
                </div>
                <div className="form-group">
                  <label>Model / Part # {isDetailReq('modelPart') && '*'}</label>
                  <input type="text" value={detailDraft.modelPart} onChange={e => setDetailDraft({ ...detailDraft, modelPart: e.target.value })} required={isDetailReq('modelPart')} />
                </div>
                <div className="form-group">
                  <label className="label-primary">Serial # {isDetailReq('serial') && '*'}</label>
                  <input type="text" value={detailDraft.serial} onChange={e => setDetailDraft({ ...detailDraft, serial: e.target.value })} required={isDetailReq('serial')} />
                </div>
                <div className="form-group">
                  <label>Arrived Date {isDetailReq('orderDate') && '*'}</label>
                  <input type="date" value={detailDraft.orderDate} onChange={e => setDetailDraft({ ...detailDraft, orderDate: e.target.value })} required={isDetailReq('orderDate')} />
                </div>
                <div className="form-group">
                  <label>Items Arrived {isDetailReq('itemsArrived') && '*'}</label>
                  <input type="number" min="0" value={detailDraft.itemsArrived} onChange={e => setDetailDraft({ ...detailDraft, itemsArrived: Number(e.target.value) })} />
                </div>
                <div className="form-group flex-row items-end">
                  <button type="button" className="action btn-primary w-100" onClick={handleAddOrUpdateDetail}>
                    <Plus size={16} /> {editingDetailId ? 'Update Product' : 'Add Product'}
                  </button>
                  {editingDetailId && (
                    <button type="button" className="action btn-secondary" onClick={() => { setEditingDetailId(null); setDetailDraft(emptyDetail); }} title="Cancel edit"><X size={16} /></button>
                  )}
                </div>
              </div>
            </div>

            <DataTable<EntranceDetail>
              columns={formDetailColumns}
              rows={formData.details ?? []}
              rowKey={d => d.detailId}
              pageSize={0}
              hideToolbar
              compact
              rowClassName={d => (d.detailId === selectedHistoryDetailId ? 'warn' : undefined)}
              emptyMessage="No products added yet. Use the form above to add products to this PO."
              actions={d => (
                <>
                  <button type="button" className="icon-btn edit" onClick={() => handleEditDetail(d)} title="Edit product"><Edit2 size={14} /></button>
                  <button type="button" className="icon-btn delete" onClick={() => handleRemoveDetail(d)} title="Remove product"><Trash2 size={14} /></button>
                  {editingId && (
                    <button type="button" className="icon-btn" onClick={() => setSelectedHistoryDetailId(d.detailId)} title="View history for this product"><PackageSearch size={14} /></button>
                  )}
                </>
              )}
            />
          </div>

          {editingId && (
            <div className="products-section history">
              <div className="products-header">
                <div>
                  <h4 className="text-primary">
                    Installation History
                    {selectedHistoryDetailId && (
                      <span className="text-sm label-note"> (filtered by selected product) <button type="button" className="btn-link" onClick={() => setSelectedHistoryDetailId(null)}>Show all</button></span>
                    )}
                  </h4>
                  <p className="text-sm text-muted m-0">Recent Work Activities using products from this PO</p>
                </div>
                <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsExpandHistoryOpen(true)}><Maximize2 size={16} /> Expand</button>
              </div>
              {historyTable(itemHistory.slice(0, 3), 'No installation history for this PO yet.')}
            </div>
          )}
        </Modal>
      )}

      {isExpandHistoryOpen && (
        <Modal
          size="large"
          level={2}
          title={<>Installation History: <span className="text-primary">{formData.po}</span></>}
          onClose={() => setIsExpandHistoryOpen(false)}
          actions={<SearchBar value={historySearchTerm} onChange={setHistorySearchTerm} />}
        >
          <div className="mt-3">
            {historyTable(filteredHistory, 'No records found matching your search.', true)}
          </div>
        </Modal>
      )}
    </div>
  );
}
