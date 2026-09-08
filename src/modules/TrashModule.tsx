import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, RotateCcw, RefreshCw, XCircle } from 'lucide-react';
import DataTable, { type DataColumn } from '../components/DataTable';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import Modal from '../components/Modal';
import NotesCell from '../components/NotesCell';
import RequirePermission from '../components/RequirePermission';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import { fetchTrash, restoreFromTrash, purgeFromTrash } from '../utils/trash';
import { formatDateTimeDisplay } from '../utils/helpers';
import type { TrashRecord } from '../types';

/**
 * Papelera de reciclaje: todo lo que se borra en la app cae acá con quién lo borró,
 * cuándo y por qué. Desde acá se restaura (con su id original) o se elimina para siempre.
 */
export default function TrashModule() {
  const { hasPermission } = useAuth();
  const authorName = useAuthorName();
  const [records, setRecords] = useState<TrashRecord[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<TrashRecord | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRecords(await fetchTrash());
    } catch (err) {
      console.error('Trash load failed', err);
      setError('Could not load the Recycle Bin. Check your permissions and the Firestore rules for "recycle_bin".');
      setRecords([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (record: TrashRecord) => {
    if (!window.confirm(`Restore "${record.label}" back to ${record.module}?`)) return;
    setBusyId(record.id);
    try {
      await restoreFromTrash(record, authorName);
      setRecords(prev => (prev ?? []).filter(r => r.id !== record.id));
    } catch (err) {
      console.error('Restore failed', err);
      alert('Could not restore the record. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purging) return;
    setBusyId(purging.id);
    try {
      await purgeFromTrash(purging, authorName);
      setRecords(prev => (prev ?? []).filter(r => r.id !== purging.id));
      setPurging(null);
    } catch (err) {
      console.error('Purge failed', err);
      alert('Could not delete the record. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<DataColumn<TrashRecord>[]>(() => [
    { id: 'deletedAt', header: 'Deleted', value: r => r.deletedAt, type: 'date', nowrap: true, render: r => formatDateTimeDisplay(r.deletedAt) },
    { id: 'module', header: 'Module', value: r => r.module, nowrap: true, render: r => <span className="badge info">{r.module}</span> },
    { id: 'label', header: 'Record', value: r => r.label, render: r => <span className="cell-strong">{r.label}</span> },
    { id: 'deletedBy', header: 'Deleted by', value: r => r.deletedBy, nowrap: true },
    { id: 'reason', header: 'Reason', value: r => r.reason, render: r => <span className="cell-clamp" title={r.reason}>{r.reason}</span> },
    { id: 'related', header: 'Extras', value: r => r.related?.length ?? 0, type: 'number', align: 'center', defaultHidden: true,
      render: r => (r.related?.length ? <span className="badge neutral">{r.related.length} related</span> : <span className="dt-dash">—</span>) },
    { id: 'payload', header: 'Data', value: () => '', align: 'center', sortable: false, filterable: false,
      render: r => <NotesCell text={JSON.stringify(r.data, null, 2)} title={`Deleted data — ${r.label}`} subtitle={`${r.module} · deleted by ${r.deletedBy}`} mono /> },
  ], []);

  if (records === null) return <LoadingScreen message="Loading recycle bin..." />;

  return (
    <div className="card max-1400 catalog-manager-anim">
      <ModuleHeader
        icon={<Trash2 size={28} />}
        title="Recycle Bin"
        subtitle="Everything deleted in the app lands here with who deleted it and why. Restore records or delete them forever."
        actions={
          <button type="button" className="action btn-secondary btn-header" onClick={load}><RefreshCw size={18} /> Refresh</button>
        }
      />
      {error && <p className="alert error">{error}</p>}
      <DataTable<TrashRecord>
        columns={columns}
        rows={records}
        rowKey={r => r.id}
        storageKey="recycle_bin"
        initialSort={{ id: 'deletedAt', dir: 'desc' }}
        emptyMessage="The recycle bin is empty."
        actions={record => (
          <>
            <RequirePermission permission="restore_trash">
              <button type="button" className="icon-btn edit" onClick={() => handleRestore(record)} disabled={busyId === record.id} title="Restore this record"><RotateCcw size={16} /></button>
            </RequirePermission>
            <RequirePermission permission="purge_trash">
              <button type="button" className="icon-btn delete" onClick={() => setPurging(record)} disabled={busyId === record.id} title="Delete forever"><XCircle size={16} /></button>
            </RequirePermission>
          </>
        )}
      />
      {hasPermission('purge_trash') && purging && (
        <Modal title="Delete forever" onClose={() => setPurging(null)} size="md" closeDisabled={busyId === purging.id}>
          <p className="alert warning">
            <b>{purging.label}</b> will be permanently deleted and cannot be recovered.
            It was deleted by <b>{purging.deletedBy}</b> — reason: “{purging.reason}”.
          </p>
          <div className="form-actions">
            <button type="button" className="action btn-secondary" onClick={() => setPurging(null)} disabled={busyId === purging.id}>Cancel</button>
            <button type="button" className="action btn-danger solid" onClick={handlePurge} disabled={busyId === purging.id}><XCircle size={16} /> {busyId === purging.id ? 'Deleting...' : 'Delete forever'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
