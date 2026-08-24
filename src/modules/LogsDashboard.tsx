import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Activity, FileText } from 'lucide-react';
import type { LogEntry } from '../types';
import Modal from '../components/Modal';
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

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Date &amp; Time</th>
              <th className="text-center">Action</th>
              <th>Module</th>
              <th>Account User</th>
              <th>Details</th>
              <th className="text-center">Payload</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 && <tr><td colSpan={6} className="empty-state">No logs found.</td></tr>}
            {filteredLogs.map(log => (
              <tr key={log.id}>
                <td data-label="Date">{formatDateTimeDisplay(log.timestamp)}</td>
                <td data-label="Action" className="text-center"><ActionBadge action={log.action} /></td>
                <td data-label="Module" className="fw-bold">{log.module}</td>
                <td data-label="Account User" className="fw-600">{log.user}</td>
                <td data-label="Details" className="text-body text-sm">{log.details}</td>
                <td data-label="Payload" className="text-center">
                  {log.payload ? (
                    <button type="button" className="icon-btn text-primary" title="View Raw Data" onClick={() => setPayloadLog(log)}>
                      <FileText size={18} />
                    </button>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payloadLog && (
        <Modal title={`Payload — ${payloadLog.module} (${payloadLog.action})`} onClose={() => setPayloadLog(null)} size="lg">
          <pre className="log-payload">{JSON.stringify(payloadLog.payload, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}
