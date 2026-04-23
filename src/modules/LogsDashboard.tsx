import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Activity, FileText } from 'lucide-react';
import { LogEntry } from '../types';
import { SearchBar } from '../components/SharedUI';

export const LogsDashboard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      const q = query(collection(db, 'system_logs'), orderBy('timestamp', 'desc'), limit(200));
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LogEntry)));
    };
    fetchLogs();
  }, []);

  const getBadgeColor = (action: string) => {
    switch (action) {
      case 'CREATE': return { bg: '#d1fae5', color: '#16a34a' }; 
      case 'UPDATE': return { bg: '#fef08a', color: '#ea580c' }; 
      case 'DELETE': return { bg: '#fee2e2', color: '#dc2626' }; 
      case 'LOGIN': return { bg: '#e0e7ff', color: '#2563eb' }; 
      default: return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  const formatDateTimeES = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return isoString; }
  };

  const filteredLogs = logs.filter(log => 
    log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="card catalog-manager-anim" style={{ maxWidth: '1400px' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Activity size={28}/> System Activity History</h2>
          <p>Traceability and security monitoring panel.</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
      </div>

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th style={{ textAlign: 'center' }}>Action</th>
              <th>Module</th>
              {/* 🔥 NOMBRE DE COLUMNA ACTUALIZADO */}
              <th>Account User</th>
              <th>Details</th>
              <th style={{ textAlign: 'center' }}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 && <tr><td colSpan={6} className="empty-state">No logs found.</td></tr>}
            {filteredLogs.map((log) => {
              const badge = getBadgeColor(log.action);
              return (
                <tr key={log.id} className="clickable-row">
                  <td data-label="Date">{formatDateTimeES(log.timestamp)}</td>
                  <td data-label="Action" style={{ textAlign: 'center' }}>
                    <span style={{ backgroundColor: badge.bg, color: badge.color, padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      {log.action}
                    </span>
                  </td>
                  <td data-label="Module" style={{ fontWeight: 'bold', color: '#334155' }}>{log.module}</td>
                  
                  {/* 🔥 AHORA IMPRIME EL NOMBRE COMPLETO FORMATEADO (En lugar de un username o email) */}
                  <td data-label="Account User" style={{ fontWeight: '600' }}>{log.user}</td>
                  
                  <td data-label="Details" style={{ color: '#475569', fontSize: '0.85rem' }}>{log.details}</td>
                  <td data-label="Payload" style={{ textAlign: 'center' }}>
                    {log.payload ? (
                      <button 
                        type="button"
                        className="icon-btn" 
                        title="View Raw Data" 
                        onClick={() => alert(JSON.stringify(log.payload, null, 2))}
                      >
                        <FileText size={18} color="#2563eb" />
                      </button>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};