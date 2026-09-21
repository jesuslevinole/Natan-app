import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { FileSpreadsheet, Upload, CheckCircle2, Download } from 'lucide-react';
import { db } from '../firebase';
import Modal from './Modal';
import DataTable, { type DataColumn } from './DataTable';
import { useAppData } from '../hooks/useAppData';
import { parseInventoryFile, groupInventoryRows, downloadWorkbook, type ImportedPO } from '../utils/excel';
import { reserveSequenceBlock, BATCH_LIMIT } from '../utils/firestore';
import { formatDateDisplay, formatCurrency } from '../utils/helpers';
import { AuditLogger } from '../utils/logger';
import { useAuthorName } from '../hooks/useAuth';
import './ImportDestinationsModal.css';

interface Props {
  onClose: () => void;
}

type Step = 'pick' | 'preview' | 'done';

const TEMPLATE_ROWS = [
  { 'PO #': 'PO 4001', 'Purch Date': '09/15/26', 'Item Name': 'KITCHEN FAUCET', 'Model #': 'MOEN-87233', 'Serial #': '', Qty: 2, Price: 103.07, Category: 'PLUMBING', Vendor: 'HD SUPPLY', Mfr: 'MOEN', Invoice: '9247518099', 'War Exp': '', Comments: 'Kitchen faucet w/ spray' },
  { 'PO #': 'PO 4001', 'Purch Date': '09/15/26', 'Item Name': 'BATH FAUCET', 'Model #': 'MOEN-84501', 'Serial #': '', Qty: 3, Price: 77.06, Category: 'PLUMBING', Vendor: 'HD SUPPLY', Mfr: 'MOEN', Invoice: '9247518099', 'War Exp': '', Comments: '' },
  { 'PO #': 'PO 4002', 'Purch Date': '09/18/26', 'Item Name': 'WATER HEATER', 'Model #': 'GCB-40', 'Serial #': '2528144434171', Qty: 1, Price: 763.44, Category: 'Boiler/HW Heater', Vendor: 'HD SUPPLY', Mfr: 'AO SMITH', Invoice: '9248074679', 'War Exp': '04/14/32', Comments: 'For building 3' },
];

const TEMPLATE_INSTRUCTIONS = [
  { Column: 'PO #', Required: 'Recommended', Notes: 'Rows with the same PO # become one purchase order. Leave empty to group by Invoice.' },
  { Column: 'Purch Date', Required: 'Yes', Notes: 'Purchase date, MM/DD/YY or MM/DD/YYYY.' },
  { Column: 'Item Name', Required: 'Yes', Notes: 'Product name. If it does not exist in the Item Names catalog it is added automatically.' },
  { Column: 'Model #', Required: 'No', Notes: 'Model or part number.' },
  { Column: 'Serial #', Required: 'No', Notes: 'Serial number of the unit, if any.' },
  { Column: 'Qty', Required: 'No', Notes: 'Units of this product (default 1).' },
  { Column: 'Price', Required: 'No', Notes: 'Unit price in USD. Used for the inventory value.' },
  { Column: 'Category', Required: 'No', Notes: 'e.g. PLUMBING, AC/HVAC, Boiler/HW Heater.' },
  { Column: 'Vendor', Required: 'Recommended', Notes: 'Supply company. New vendors are added to the catalog automatically.' },
  { Column: 'Mfr / Invoice / War Exp / Comments', Required: 'No', Notes: 'Manufacturer, invoice number, warranty expiration and notes.' },
];

/**
 * Importa el "Inventory Report" del cliente (o la plantilla propia) a `itemEntrance`:
 * una fila del reporte = una unidad; se agrupan por PO # (o por factura si no hay PO) y las
 * filas idénticas se fusionan sumando cantidad. Los POs que ya existen se omiten.
 * También crea en los catálogos los proveedores y nombres de ítem que falten.
 */
export default function ImportInventoryModal({ onClose }: Props) {
  const { entrances, supplyCompanies, itemNames } = useAppData();
  const authorName = useAuthorName();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [property, setProperty] = useState('Hidden Creek Apartments');
  const [location, setLocation] = useState('0BLDG/SHOP');
  const [fileName, setFileName] = useState('');
  const [groups, setGroups] = useState<ImportedPO[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ pos: 0, units: 0, companies: 0, items: 0 });

  const existingPOs = useMemo(() => new Set(entrances.map(e => (e.po || '').toUpperCase())), [entrances]);
  const existingCompanies = useMemo(() => new Set(supplyCompanies.map(c => (c.company || '').toLowerCase())), [supplyCompanies]);
  const existingItems = useMemo(() => new Set(itemNames.map(i => (i.item_name || '').toLowerCase())), [itemNames]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setIsParsing(true);
    setFileName(file.name);
    try {
      const rows = await parseInventoryFile(file);
      if (rows.length === 0) {
        setError('No inventory rows were detected. Expected the client\'s "Inventory Report" columns (Item, Purch Date, Model #, Serial #, Vendor, Invoice, Price, Comments) or the template.');
        return;
      }
      setGroups(groupInventoryRows(rows));
      setExcluded(new Set());
      setStep('preview');
    } catch (err) {
      console.error(err);
      setError('Could not read the file. Make sure it is a valid .xlsx, .xls or .csv file.');
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isDuplicate = useCallback((g: ImportedPO) => !!g.po && existingPOs.has(g.po.toUpperCase()), [existingPOs]);
  const toImport = useMemo(() => groups.filter(g => !isDuplicate(g) && !excluded.has(g.key)), [groups, excluded, isDuplicate]);
  const duplicates = useMemo(() => groups.filter(isDuplicate), [groups, isDuplicate]);

  const newCompanies = useMemo(() => [...new Set(toImport.map(g => g.supplyCompany).filter(c => c && !existingCompanies.has(c.toLowerCase())))], [toImport, existingCompanies]);
  const newItems = useMemo(() => [...new Set(toImport.flatMap(g => g.rows.map(r => r.item)).filter(m => m && !existingItems.has(m.toLowerCase())))], [toImport, existingItems]);
  const totals = useMemo(() => toImport.reduce((acc, g) => ({ units: acc.units + g.units, value: acc.value + g.value }), { units: 0, value: 0 }), [toImport]);

  const toggleExcluded = (key: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    if (toImport.length === 0) return;
    setIsImporting(true);
    setError('');
    setProgress(0);
    try {
      const createdAt = new Date().toISOString();
      const firstSeq = await reserveSequenceBlock('itemEntranceSeq', toImport.length);
      const companySeq = newCompanies.length ? await reserveSequenceBlock('seq_catalog_supply_companies', newCompanies.length) : 0;
      const itemSeq = newItems.length ? await reserveSequenceBlock('seq_catalog_item_names', newItems.length) : 0;

      // 1) Catálogos que faltan (proveedores y nombres de ítem), en un solo batch.
      if (newCompanies.length || newItems.length) {
        const batch = writeBatch(db);
        newCompanies.forEach((company, i) => batch.set(doc(collection(db, 'catalog_supply_companies')), { company, address: '', seq: companySeq + i, createdAt }));
        newItems.forEach((item_name, i) => batch.set(doc(collection(db, 'catalog_item_names')), { item_name, category: '', seq: itemSeq + i, createdAt }));
        await batch.commit();
      }

      // 2) Un documento de itemEntrance por PO, con sus detalles.
      const colRef = collection(db, 'itemEntrance');
      let written = 0;
      for (let i = 0; i < toImport.length; i += BATCH_LIMIT) {
        const chunk = toImport.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach((g, idx) => {
          const details = g.rows.map((r, j) => ({
            detailId: `det_imp_${firstSeq + i + idx}_${j}`,
            itemName: r.item || r.model,
            modelPart: r.model || r.item,
            serial: r.serial,
            orderDate: r.date,
            itemsArrived: r.qty,
            category: r.category,
            price: r.price ?? null,
            invoice: r.invoice,
            warrantyExp: r.warrantyExp,
            manufacturer: r.manufacturer,
            comments: r.comments,
          }));
          batch.set(doc(colRef), {
            seq: firstSeq + i + idx,
            createdAt,
            date: g.date,
            po: g.po,
            supplyCompany: g.supplyCompany,
            property: property.trim(),
            location: location.trim(),
            notes: g.po ? '' : `Imported without PO number — grouped by invoice ${g.rows[0]?.invoice || ''}`.trim(),
            details,
            itemName: details[0]?.itemName ?? '',
            modelPart: details[0]?.modelPart ?? '',
            serial: details[0]?.serial ?? '',
            orderDate: details[0]?.orderDate ?? '',
            itemsArrived: details.reduce((sum, d) => sum + d.itemsArrived, 0),
          });
        });
        await batch.commit();
        written += chunk.length;
        setProgress(Math.round((written / toImport.length) * 100));
      }
      AuditLogger.logImport('Item Entrance (Inventory)', authorName, toImport.length, { file: fileName, property, location, units: totals.units, value: totals.value, newCompanies, newItems });
      setResult({ pos: toImport.length, units: totals.units, companies: newCompanies.length, items: newItems.length });
      setStep('done');
    } catch (err) {
      console.error('Import failed', err);
      setError('The import failed. Some records may have been written — check Item Entrance before retrying.');
    } finally {
      setIsImporting(false);
    }
  };

  const columns: DataColumn<ImportedPO>[] = [
    { id: 'import', header: 'Import', value: g => (isDuplicate(g) ? 'dup' : excluded.has(g.key) ? 'skip' : 'yes'), align: 'center', sortable: false, filterable: false, hideable: false,
      render: g => <input type="checkbox" className="checkbox-lg" checked={!isDuplicate(g) && !excluded.has(g.key)} disabled={isDuplicate(g)} onChange={() => toggleExcluded(g.key)} /> },
    { id: 'po', header: 'PO #', value: g => g.po, nowrap: true, render: g => g.po ? <span className="cell-strong text-primary cell-mono">{g.po}</span> : <span className="badge warning">No PO</span> },
    { id: 'date', header: 'Date', value: g => g.date, type: 'date', nowrap: true, render: g => formatDateDisplay(g.date) },
    { id: 'supplyCompany', header: 'Vendor', value: g => g.supplyCompany },
    { id: 'items', header: 'Products', value: g => g.rows.map(r => `${r.qty}× ${r.item || r.model}`).join(', '), render: g => <span className="cell-clamp" title={g.rows.map(r => `${r.qty}× ${r.item || r.model}`).join('\n')}>{g.rows.map(r => `${r.qty}× ${r.item || r.model}`).join(', ')}</span> },
    { id: 'units', header: 'Units', value: g => g.units, type: 'number', align: 'center' },
    { id: 'value', header: 'Value', value: g => g.value, type: 'number', align: 'right', render: g => formatCurrency(g.value) },
    { id: 'status', header: 'Status', value: g => (isDuplicate(g) ? 'exists' : excluded.has(g.key) ? 'skipped' : 'new'), align: 'center',
      render: g => isDuplicate(g) ? <span className="badge neutral">Already exists</span> : excluded.has(g.key) ? <span className="badge warning">Skipped</span> : <span className="badge success">New</span> },
  ];

  const downloadTemplate = () => downloadWorkbook('inventory-import-template.xlsx', [
    { name: 'Products', rows: TEMPLATE_ROWS as unknown as Record<string, unknown>[] },
    { name: 'Instructions', rows: TEMPLATE_INSTRUCTIONS as unknown as Record<string, unknown>[] },
  ]);

  return (
    <Modal
      title={<span className="flex-row"><FileSpreadsheet size={20} /> Import Inventory (POs)</span>}
      onClose={onClose}
      size={step === 'preview' ? '2xl' : 'lg'}
      level={2}
      closeDisabled={isImporting}
    >
      {error && <p className="alert error">{error}</p>}

      {step === 'pick' && (
        <div className="import-pick">
          <div className="form-grid mb-4">
            <div className="form-group">
              <label htmlFor="inv-property">Property / Complex</label>
              <input id="inv-property" type="text" value={property} onChange={e => setProperty(e.target.value)} placeholder="e.g. Hidden Creek Apartments" />
            </div>
            <div className="form-group">
              <label htmlFor="inv-location">Stock location</label>
              <input id="inv-location" type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 0BLDG/SHOP" />
            </div>
          </div>
          <label className="import-dropzone">
            <Upload size={28} />
            <strong>{isParsing ? 'Reading file...' : 'Click to choose an Excel or CSV file'}</strong>
            <span>Easiest way: download the template below, fill one row per product (with Qty) and upload it here. Rows with the same PO # become one purchase order, and item names or vendors that don&apos;t exist yet are added to the catalogs automatically. The client&apos;s &quot;Inventory Report&quot; export also works as-is.</span>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => handleFile(e.target.files?.[0])} disabled={isParsing} />
          </label>
          <button type="button" className="action btn-secondary mt-3" onClick={downloadTemplate}><Download size={15} /> Download import template (.xlsx)</button>
        </div>
      )}

      {step === 'preview' && (
        <>
          <dl className="import-stats mb-3">
            <div><dt>File</dt><dd>{fileName}</dd></div>
            <div><dt>POs detected</dt><dd>{groups.length}</dd></div>
            <div><dt>Already exist</dt><dd>{duplicates.length}</dd></div>
            <div><dt>Will import</dt><dd className="text-success fw-bold">{toImport.length} POs · {totals.units} units · {formatCurrency(totals.value)}</dd></div>
          </dl>
          {(newCompanies.length > 0 || newItems.length > 0) && (
            <p className="alert info">
              The import will also add <b>{newCompanies.length}</b> supply compan{newCompanies.length === 1 ? 'y' : 'ies'} and <b>{newItems.length}</b> item name{newItems.length === 1 ? '' : 's'} to the catalogs.
            </p>
          )}
          <DataTable<ImportedPO>
            columns={columns}
            rows={groups}
            rowKey={g => g.key}
            pageSize={0}
            hideToolbar
            compact
            initialSort={{ id: 'date', dir: 'asc' }}
            rowClassName={g => (isDuplicate(g) || excluded.has(g.key) ? 'import-row-skip' : undefined)}
          />
          {isImporting && (
            <div className="progress-wrap mt-3">
              <div className="progress-track"><div className="progress-bar" style={{ '--progress': `${progress}%` } as CSSProperties} /></div>
              <span className="progress-label">{progress}%</span>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="action btn-secondary" onClick={() => setStep('pick')} disabled={isImporting}>Choose another file</button>
            <button type="button" className="action btn-primary" onClick={handleImport} disabled={isImporting || toImport.length === 0}>
              <Upload size={16} /> {isImporting ? 'Importing...' : `Import ${toImport.length} PO${toImport.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="import-done">
          <CheckCircle2 size={48} className="text-success" />
          <h4>{result.pos} PO{result.pos === 1 ? '' : 's'} imported ({result.units} units)</h4>
          <p className="text-muted">
            They are now available in Item Entrance, Reports and the Dashboard.
            {result.companies > 0 && ` ${result.companies} supply company(ies) added.`}
            {result.items > 0 && ` ${result.items} item name(s) added.`}
            {duplicates.length > 0 && ` ${duplicates.length} PO(s) already existed and were skipped.`}
          </p>
          <div className="form-actions borderless justify-center">
            <button type="button" className="action btn-secondary" onClick={() => { setStep('pick'); setGroups([]); setFileName(''); }}>Import another file</button>
            <button type="button" className="action btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
