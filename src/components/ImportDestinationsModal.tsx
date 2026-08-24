import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { FileSpreadsheet, Upload, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase';
import Modal from './Modal';
import { useAppData } from '../hooks/useAppData';
import { parseDestinationsFile, type ImportedDestination } from '../utils/excel';
import { reserveSequenceBlock, BATCH_LIMIT } from '../utils/firestore';
import { AuditLogger } from '../utils/logger';
import { useAuthorName } from '../hooks/useAuth';
import './ImportDestinationsModal.css';

interface Props {
  onClose: () => void;
}

type Step = 'pick' | 'preview' | 'done';

/**
 * Importación masiva de direcciones desde Excel/CSV al catálogo `catalog_destinations`.
 * Acepta el formato del cliente (bloques `unidad | calle`) y tablas con encabezados.
 * Las direcciones ya existentes se detectan y se omiten (no se duplican).
 */
export default function ImportDestinationsModal({ onClose }: Props) {
  const { destinations } = useAppData();
  const authorName = useAuthorName();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [property, setProperty] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportedDestination[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);

  const existing = useMemo(() => new Set(destinations.map(d => (d.description || '').toLowerCase())), [destinations]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setIsParsing(true);
    setFileName(file.name);
    try {
      const parsed = await parseDestinationsFile(file, property || 'Imported');
      if (!property && parsed.suggestedProperty) setProperty(parsed.suggestedProperty);
      if (parsed.rows.length === 0) {
        setError('No addresses were detected in this file. Expected pairs of "unit number | street" or a table with an "Address" column.');
        return;
      }
      setRows(parsed.rows);
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

  const effectiveRows = useMemo(
    () => rows.map(r => ({ ...r, property: property || r.property })),
    [rows, property],
  );
  const duplicates = useMemo(() => effectiveRows.filter(r => existing.has(r.description.toLowerCase())), [effectiveRows, existing]);
  const toImport = useMemo(
    () => effectiveRows.filter(r => !existing.has(r.description.toLowerCase()) && !excluded.has(r.description)),
    [effectiveRows, existing, excluded],
  );
  const streets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of toImport) counts.set(r.street || '(no street)', (counts.get(r.street || '(no street)') || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [toImport]);

  const toggleExcluded = (description: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(description)) next.delete(description); else next.add(description);
      return next;
    });
  };

  const handleImport = async () => {
    if (toImport.length === 0) return;
    setIsImporting(true);
    setError('');
    setProgress(0);
    try {
      const firstSeq = await reserveSequenceBlock('seq_catalog_destinations', toImport.length);
      const createdAt = new Date().toISOString();
      const colRef = collection(db, 'catalog_destinations');
      let written = 0;
      for (let i = 0; i < toImport.length; i += BATCH_LIMIT) {
        const chunk = toImport.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach((r, idx) => {
          batch.set(doc(colRef), {
            description: r.description,
            property: r.property,
            street: r.street,
            unit: r.unit ?? null,
            seq: firstSeq + i + idx,
            createdAt,
          });
        });
        await batch.commit();
        written += chunk.length;
        setProgress(Math.round((written / toImport.length) * 100));
      }
      AuditLogger.logImport('Catalogs (Destinations)', authorName, toImport.length, { file: fileName, property, streets: Object.fromEntries(streets) });
      setImportedCount(toImport.length);
      setStep('done');
    } catch (err) {
      console.error('Import failed', err);
      setError('The import failed. Some records may have been written — check the catalog before retrying.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      title={<span className="flex-row"><FileSpreadsheet size={20} /> Import Addresses from Excel</span>}
      onClose={onClose}
      size={step === 'preview' ? 'xl' : 'lg'}
      level={2}
      closeDisabled={isImporting}
    >
      {error && <p className="alert error">{error}</p>}

      {step === 'pick' && (
        <div className="import-pick">
          <div className="form-group mb-4">
            <label htmlFor="import-property">Property / Complex name</label>
            <input id="import-property" type="text" placeholder="e.g. Hidden Creek Apartments" value={property} onChange={e => setProperty(e.target.value)} />
            <span className="hint">Applied to every imported address. If left empty, the title found in the file is used.</span>
          </div>
          <label className="import-dropzone">
            <Upload size={28} />
            <strong>{isParsing ? 'Reading file...' : 'Click to choose an Excel or CSV file'}</strong>
            <span>Supported: the client&apos;s unit lists (unit # | street blocks) or a table with an &quot;Address&quot; column.</span>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => handleFile(e.target.files?.[0])} disabled={isParsing} />
          </label>
        </div>
      )}

      {step === 'preview' && (
        <>
          <div className="import-summary">
            <div className="form-group">
              <label htmlFor="import-property-2">Property / Complex</label>
              <input id="import-property-2" type="text" value={property} onChange={e => setProperty(e.target.value)} />
            </div>
            <dl className="import-stats">
              <div><dt>File</dt><dd>{fileName}</dd></div>
              <div><dt>Detected</dt><dd>{rows.length}</dd></div>
              <div><dt>Already exist</dt><dd>{duplicates.length}</dd></div>
              <div><dt>Will import</dt><dd className="text-success fw-bold">{toImport.length}</dd></div>
            </dl>
          </div>
          {streets.length > 0 && (
            <ul className="import-streets">
              {streets.map(([street, count]) => <li key={street}><strong>{count}</strong> {street}</li>)}
            </ul>
          )}
          <div className="table-container scroll-300">
            <table className="responsive-table">
              <thead>
                <tr><th className="text-center">Import</th><th>Address</th><th>Street</th><th className="text-center">Unit</th><th>Status</th></tr>
              </thead>
              <tbody>
                {effectiveRows.map(r => {
                  const isDup = existing.has(r.description.toLowerCase());
                  const isExcluded = excluded.has(r.description);
                  return (
                    <tr key={r.description} className={isDup || isExcluded ? 'import-row-skip' : undefined}>
                      <td data-label="Import" className="text-center">
                        <input type="checkbox" className="checkbox-lg" checked={!isDup && !isExcluded} disabled={isDup} onChange={() => toggleExcluded(r.description)} />
                      </td>
                      <td data-label="Address" className="fw-bold">{r.description}</td>
                      <td data-label="Street">{r.street || '-'}</td>
                      <td data-label="Unit" className="text-center">{r.unit ?? '-'}</td>
                      <td data-label="Status">
                        {isDup ? <span className="badge neutral">Already exists</span> : isExcluded ? <span className="badge warning">Skipped</span> : <span className="badge success">New</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isImporting && (
            <div className="progress-wrap mt-3">
              <div className="progress-track"><div className="progress-bar" style={{ '--progress': `${progress}%` } as CSSProperties} /></div>
              <span className="progress-label">{progress}%</span>
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="action btn-secondary" onClick={() => setStep('pick')} disabled={isImporting}>Choose another file</button>
            <button type="button" className="action btn-primary" onClick={handleImport} disabled={isImporting || toImport.length === 0}>
              <Upload size={16} /> {isImporting ? 'Importing...' : `Import ${toImport.length} address${toImport.length === 1 ? '' : 'es'}`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="import-done">
          <CheckCircle2 size={48} className="text-success" />
          <h4>{importedCount} address{importedCount === 1 ? '' : 'es'} imported</h4>
          <p className="text-muted">They are now available in Work Activity and Reports.{duplicates.length > 0 && ` ${duplicates.length} already existed and were skipped.`}</p>
          <div className="form-actions borderless justify-center">
            <button type="button" className="action btn-secondary" onClick={() => { setStep('pick'); setRows([]); setFileName(''); }}>Import another file</button>
            <button type="button" className="action btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
