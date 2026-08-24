import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Activity, FileText } from 'lucide-react';
import type { LogEntry } from '../types';
import Modal from '../components/Modal';
import DataTable, { type DataColumn } from '../components/DataTable';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { ActionBadge } from '../components/StatusBadge';
import { docToRecord } from '../utils/firestore';
import { formatDateTimeDisplay, matchesSearch } from '../utils/helpers';
import './LogsDashboard.css';

const LOG_LIMIT = 200;

export default function LogsDashboard() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [payloadLog, setPayloadLog] = useState<LogEntry | null>(null);

  // Los logs son solo de este módulo (no se comparten), por eso el listener vive acá y no
  // en DataProvider. Es onSnapshot (antes getDocs) para ver acciones nuevas sin recargar.
  useEffect(() => {
    const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(LOG_LIMIT));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => docToRecord<LogEntry>(d)));
      setIsLoading(false);
    }, (error) => {
      console.error('Error loading logs:', error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = useMemo(
    () => logs.filter(log => matchesSearch(searchTerm, log.user, log.module, log.details, log.action)),
    [logs, searchTerm],
  );

  const logColumns = useMemo<DataColumn<LogEntry>[]>(() => [
    { id: 'timestamp', header: 'Date & Time', value: l => l.timestamp, type: 'date', nowrap: true, hideable: false, render: l => <span className="cell-mono">{formatDateTimeDisplay(l.timestamp)}</span> },
    { id: 'action', header: 'Action', value: l => l.action, align: 'center', render: l => <ActionBadge action={l.action} /> },
    { id: 'module', header: 'Module', value: l => l.module, render: l => <span className="cell-strong">{l.module}</span> },
    { id: 'user', header: 'Account User', value: l => l.user, render: l => <span className="fw-600">{l.user}</span> },
    { id: 'details', header: 'Details', value: l => l.details, render: l => <span className="cell-clamp text-body" title={l.details}>{l.details}</span> },
    { id: 'payload', header: 'Payload', value: l => (l.payload ? 'yes' : ''), align: 'center', sortable: false, filterable: false,
      render: l => l.payload ? (
        <button type="button" className="icon-btn text-primary" title="View Raw Data" onClick={() => setPayloadLog(l)}><FileText size={18} /></button>
      ) : <span className="dt-dash">—</span> },
  ], []);

  if (isLoading) return <LoadingScreen message="Loading activity history..." />;

  return (
    <div className="card max-1400 catalog-manager-anim">
      <ModuleHeader
        icon={<Activity size={28} />}
        title="System Activity History"
        subtitle={`Traceability and security monitoring panel (last ${LOG_LIMIT} events).`}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
      />

      <DataTable<LogEntry>
        columns={logColumns}
        rows={filteredLogs}
        rowKey={l => l.id ?? `${l.timestamp}-${l.user}`}
        storageKey="logs"
        initialSort={{ id: 'timestamp', dir: 'desc' }}
        pageSize={50}
        compact
        emptyMessage="No activity recorded yet."
      />

      {payloadLog && (
        <Modal title={`Payload — ${payloadLog.module} (${payloadLog.action})`} onClose={() => setPayloadLog(null)} size="lg">
          <pre className="log-payload">{JSON.stringify(payloadLog.payload, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}
