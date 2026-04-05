import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; 
import { BookOpen, ArrowLeft, Plus, Edit2, Trash2, X } from 'lucide-react';
import { CatalogSchema } from '../types';
import { SeqBadge, SearchBar } from '../components/SharedUI';
import { catalogsConfig } from '../utils/helpers';

export const CatalogsModule: React.FC = () => {
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSchema | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [modalState, setModalState] = useState<'closed' | 'form' | 'detail'>('closed');
  const [currentRecord, setCurrentRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (!selectedCatalog) return;
    const unsubscribe = onSnapshot(collection(db, `catalog_${selectedCatalog.id}`), (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      fetched.sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      const mapped = fetched.map((item: any, idx: number) => ({ ...item, visualSeq: item.seq || (idx + 1) }));
      mapped.reverse(); 
      setRecords(mapped);
    });
    return () => unsubscribe();
  }, [selectedCatalog]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const colName = `catalog_${selectedCatalog!.id}`;
      if (currentRecord) {
        await updateDoc(doc(db, colName, currentRecord.id), formData);
      } else {
        const nextSeq = records.length > 0 ? Math.max(...records.map(r => r.visualSeq || 0)) + 1 : 1;
        await addDoc(collection(db, colName), { ...formData, seq: nextSeq, createdAt: new Date().toISOString() });
      }
      setModalState('closed');
    } catch (error) { 
      console.error("Error", error); alert('Error saving record.'); 
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this record?')) {
      await deleteDoc(doc(db, `catalog_${selectedCatalog!.id}`, id));
      setModalState('closed');
    }
  };

  const filteredRecords = records.filter(reg => {
    const searchLower = searchTerm.toLowerCase();
    return selectedCatalog?.fields.some(f => 
      String(reg[f.name] || '').toLowerCase().includes(searchLower)
    );
  });

  // SOLUCIÓN AL ts(18046): Especificar explícitamente (cat: CatalogSchema)
  if (!selectedCatalog) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-header-text">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><BookOpen size={28}/> System Catalogs</h2>
            <p>Manage system lists and dynamic parameters.</p>
          </div>
        </div>
        <div className="catalog-grid">
          {Object.values(catalogsConfig).map((cat: CatalogSchema) => (
            <div key={cat.id} className="catalog-card" onClick={() => setSelectedCatalog(cat)}>
              <div className="catalog-icon" style={{ color: 'var(--primary-color)' }}>{cat.icon}</div>
              <h3>{cat.title}</h3>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card catalog-manager-anim">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, minWidth: '200px' }}>
          <button className="icon-btn" onClick={() => setSelectedCatalog(null)} title="Back"><ArrowLeft size={24} color="var(--text-main)"/></button>
          <div className="card-header-text">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>{selectedCatalog.title}</h2>
          </div>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '150px' }}>
          <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => { setCurrentRecord(null); setFormData({}); setModalState('form'); }}>
            <Plus size={18}/> New Record
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>#</th>
              {selectedCatalog.fields.map(f => (<th key={f.name}>{f.label}</th>))}
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && <tr><td colSpan={selectedCatalog.fields.length + 2} className="empty-state">No records found.</td></tr>}
            {filteredRecords.map((reg) => (
              <tr key={reg.id}>
                <td data-label="#"><SeqBadge seq={reg.visualSeq} /></td>
                {selectedCatalog.fields.map(f => (
                  <td key={f.name} data-label={f.label} style={{ fontWeight: f.name === selectedCatalog.fields[0].name ? 'bold' : 'normal' }}>
                    {reg[f.name] || '-'}
                  </td>
                ))}
                <td data-label="Actions" style={{ textAlign: 'center' }}>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => { setCurrentRecord(reg); setFormData(reg); setModalState('form'); }}><Edit2 size={16}/></button>
                    <button className="icon-btn delete" onClick={() => handleDelete(reg.id)}><Trash2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState !== 'closed' && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{modalState === 'detail' ? 'Details' : (currentRecord ? 'Edit Record' : 'New Record')}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                {modalState === 'form' && <button className="action btn-primary" onClick={handleSave}>Save</button>}
                <button className="close-modal" onClick={() => setModalState('closed')}><X size={24}/></button>
              </div>
            </div>
            {modalState === 'form' && (
              <form onSubmit={handleSave} style={{ paddingTop: '15px' }}>
                <div className="form-grid">
                  {selectedCatalog.fields.map(field => (
                    <div key={field.name} className="form-group full-width">
                      <label>{field.label} {field.required && '*'}</label>
                      {field.type === 'select' ? (
                        <select name={field.name} value={formData[field.name] || ''} onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} required={field.required}>
                          <option value="">Select...</option>
                          {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={field.type} name={field.name} value={formData[field.name] || ''} onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} required={field.required} />
                      )}
                    </div>
                  ))}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};