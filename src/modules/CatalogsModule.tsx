import { useState, useMemo, type FormEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { BookOpen, ArrowLeft, Plus, Edit2, Trash2, FileSpreadsheet, Download } from 'lucide-react';
import type { CatalogSchema, CatalogRecord } from '../types';
import Modal from '../components/Modal';
import ModuleHeader from '../components/ModuleHeader';
import SeqBadge from '../components/SeqBadge';
import DataTable, { type DataColumn } from '../components/DataTable';
import ImportDestinationsModal from '../components/ImportDestinationsModal';
import { catalogsConfig, matchesSearch } from '../utils/helpers';
import { nextSequence } from '../utils/firestore';
import { downloadWorkbook } from '../utils/excel';
import { useAppData } from '../hooks/useAppData';
import { useAuthorName } from '../hooks/useAuth';
import RequirePermission from '../components/RequirePermission';
import { AuditLogger } from '../utils/logger';

type FormValues = Record<string, string | number>;

export default function CatalogsModule() {
  const authorName = useAuthorName();
  const { destinations, supplyCompanies, itemNames, jobOrders } = useAppData();

  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSchema | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [modalState, setModalState] = useState<'closed' | 'form'>('closed');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<CatalogRecord | null>(null);
  const [formData, setFormData] = useState<FormValues>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Los catálogos ya llegan en tiempo real desde DataProvider; acá solo elegimos cuál mostrar
  // y le asignamos el número visual (más reciente arriba).
  const records = useMemo<CatalogRecord[]>(() => {
    if (!selectedCatalog) return [];
    const source: CatalogRecord[] =
      selectedCatalog.id === 'destinations' ? destinations
      : selectedCatalog.id === 'supply_companies' ? supplyCompanies
      : itemNames;
    const sorted = [...source].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const total = sorted.length;
    return sorted.map((r, idx) => ({ ...r, visualSeq: r.seq || total - idx }));
  }, [selectedCatalog, destinations, supplyCompanies, itemNames]);

  const properties = useMemo(
    () => [...new Set(destinations.map(d => d.property).filter((p): p is string => !!p))].sort(),
    [destinations],
  );

  const visibleFields = useMemo(() => selectedCatalog?.fields.filter(f => !f.hiddenInTable) ?? [], [selectedCatalog]);

  const catalogColumns = useMemo<DataColumn<CatalogRecord>[]>(() => [
    { id: 'seq', header: '#', value: r => r.visualSeq ?? r.seq ?? null, type: 'number', align: 'center', width: '70px', hideable: false, render: r => <SeqBadge seq={r.visualSeq} /> },
    ...visibleFields.map((f, idx): DataColumn<CatalogRecord> => ({
      id: f.name,
      header: f.label,
      value: r => (r[f.name] as string | number | undefined) ?? '',
      type: f.type === 'number' ? 'number' : 'text',
      render: idx === 0 ? (r => <span className="cell-strong">{String(r[f.name] ?? '—')}</span>) : undefined,
    })),
  ], [visibleFields]);

  const filteredRecords = useMemo(() => records.filter(reg => {
    if (selectedCatalog?.id === 'destinations' && propertyFilter && reg.property !== propertyFilter) return false;
    return matchesSearch(searchTerm, ...(selectedCatalog?.fields.map(f => reg[f.name]) ?? []));
  }), [records, selectedCatalog, searchTerm, propertyFilter]);

  const openForm = (record: CatalogRecord | null) => {
    setCurrentRecord(record);
    if (record) {
      const values: FormValues = {};
      selectedCatalog?.fields.forEach(f => { const v = record[f.name]; if (v !== undefined) values[f.name] = v; });
      setFormData(values);
    } else {
      setFormData(selectedCatalog?.id === 'destinations' && propertyFilter ? { property: propertyFilter } : {});
    }
    setModalState('form');
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCatalog) return;
    setIsProcessing(true);
    try {
      const colName = `catalog_${selectedCatalog.id}`;
      const payload: FormValues = {};
      selectedCatalog.fields.forEach(f => {
        const raw = formData[f.name];
        if (raw === undefined || raw === '') return;
        payload[f.name] = f.type === 'number' ? Number(raw) : String(raw).trim();
      });
      if (currentRecord) {
        await updateDoc(doc(db, colName, currentRecord.id), payload);
        AuditLogger.logUpdate(`Catalogs (${selectedCatalog.title})`, authorName, currentRecord.id, payload);
      } else {
        const seq = await nextSequence(`seq_${colName}`);
        const docRef = await addDoc(collection(db, colName), { ...payload, seq, createdAt: new Date().toISOString() });
        AuditLogger.logCreate(`Catalogs (${selectedCatalog.title})`, authorName, docRef.id, payload);
      }
      setModalState('closed');
    } catch (error) {
      console.error('Error Saving Record:', error);
      alert('Error saving record. Check console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (record: CatalogRecord) => {
    if (!selectedCatalog) return;
    const label = String(record[selectedCatalog.fields[0].name] ?? record.id);
    // Una dirección con órdenes asociadas no se borra: quedarían órdenes apuntando a nada.
    if (selectedCatalog.id === 'destinations') {
      const inUse = jobOrders.filter(o => o.destination === record.description).length;
      if (inUse > 0) { alert(`"${label}" is used by ${inUse} job order(s) and cannot be deleted.`); return; }
    }
    if (!window.confirm(`Delete "${label}"?`)) return;
    await deleteDoc(doc(db, `catalog_${selectedCatalog.id}`, record.id));
    AuditLogger.logDelete(`Catalogs (${selectedCatalog.title})`, authorName, record.id, record);
  };

  const handleExport = () => {
    if (!selectedCatalog) return;
    const rows = filteredRecords.map(r => {
      const row: Record<string, unknown> = { '#': r.visualSeq };
      selectedCatalog.fields.forEach(f => { row[f.label] = r[f.name] ?? ''; });
      return row;
    });
    downloadWorkbook(`${selectedCatalog.id}.xlsx`, [{ name: selectedCatalog.title, rows }]);
  };

  if (!selectedCatalog) {
    return (
      <div className="card">
        <ModuleHeader icon={<BookOpen size={28} />} title="System Catalogs" subtitle="Manage system lists and dynamic parameters." />
        <ul className="catalog-grid">
          {Object.values(catalogsConfig).map(cat => {
            const count = cat.id === 'destinations' ? destinations.length : cat.id === 'supply_companies' ? supplyCompanies.length : itemNames.length;
            return (
              <li key={cat.id} className="catalog-card" onClick={() => { setSelectedCatalog(cat); setSearchTerm(''); setPropertyFilter(''); }}>
                <div className="catalog-icon">{cat.icon}</div>
                <h3>{cat.title}</h3>
                <span className="badge neutral">{count} records</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const isDestinations = selectedCatalog.id === 'destinations';

  return (
    <div className="card catalog-manager-anim">
      <ModuleHeader
        icon={
          <button type="button" className="icon-btn" onClick={() => setSelectedCatalog(null)} title="Back to catalogs">
            <ArrowLeft size={24} />
          </button>
        }
        title={selectedCatalog.title}
        subtitle={`${filteredRecords.length} of ${records.length} records`}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        filters={isDestinations && properties.length > 0 ? (
          <select className="dropdown-select" value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} aria-label="Filter by property">
            <option value="">All properties</option>
            {properties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : undefined}
        actions={
          <>
            <button type="button" className="action btn-secondary btn-header" onClick={handleExport} title="Download as Excel"><Download size={18} /> Export</button>
            <RequirePermission permission="manage_catalogs">
              {selectedCatalog.importable && (
                <button type="button" className="action btn-secondary btn-header" onClick={() => setIsImportOpen(true)}><FileSpreadsheet size={18} /> Import</button>
              )}
              <button type="button" className="action btn-primary btn-header" onClick={() => openForm(null)}><Plus size={18} /> New Record</button>
            </RequirePermission>
          </>
        }
      />

      <DataTable<CatalogRecord>
        columns={catalogColumns}
        rows={filteredRecords}
        rowKey={r => r.id}
        storageKey={`catalog_${selectedCatalog.id}`}
        initialSort={{ id: 'seq', dir: 'asc' }}
        emptyMessage="No records in this catalog yet."
        actions={reg => (
          <RequirePermission permission="manage_catalogs">
            <button type="button" className="icon-btn edit" onClick={() => openForm(reg)} title="Edit"><Edit2 size={16} /></button>
            <button type="button" className="icon-btn delete" onClick={() => handleDelete(reg)} title="Delete"><Trash2 size={16} /></button>
          </RequirePermission>
        )}
      />

      {modalState === 'form' && (
        <Modal
          size="md"
          title={currentRecord ? 'Edit Record' : 'New Record'}
          onClose={() => setModalState('closed')}
          onSubmit={handleSave}
          closeDisabled={isProcessing}
          actions={<button type="submit" className="action btn-primary" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save'}</button>}
        >
          <div className="form-grid single-col">
            {selectedCatalog.fields.map(field => (
              <div key={field.name} className="form-group">
                <label htmlFor={`cat-${field.name}`}>
                  {field.label} {field.required && <span className="required-mark">*</span>}
                </label>
                {field.name === 'property' && properties.length > 0 ? (
                  <>
                    <input id={`cat-${field.name}`} type="text" list="property-options" value={formData[field.name] ?? ''} onChange={e => setFormData({ ...formData, [field.name]: e.target.value })} disabled={isProcessing} />
                    <datalist id="property-options">{properties.map(p => <option key={p} value={p} />)}</datalist>
                  </>
                ) : (
                  <input
                    id={`cat-${field.name}`}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={formData[field.name] ?? ''}
                    onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
                    required={field.required}
                    disabled={isProcessing}
                  />
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {isImportOpen && <ImportDestinationsModal onClose={() => setIsImportOpen(false)} />}
    </div>
  );
}
