import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { BookOpen, ArrowLeft, Plus, Edit2, Trash2, X } from 'lucide-react';
import { CatalogSchema } from '../types';
import { SeqBadge, SearchBar } from '../components/SharedUI';
import { catalogsConfig } from '../utils/helpers';

// 🔥 ESTA ES LA LÍNEA CRÍTICA QUE REACT NECESITA ENCONTRAR:
export const CatalogsModule: React.FC = () => {
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSchema | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [modalState, setModalState] = useState<'closed' | 'form' | 'detail'>('closed');
  const [currentRecord, setCurrentRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedCatalog) return;
    const unsubscribe = onSnapshot(collection(db, `catalog_${selectedCatalog.id}`), (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      fetched.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      const totalRecords = fetched.length;
      const mapped = fetched.map((item: any, idx: number) => ({ 
        ...item, 
        visualSeq: item.seq || (totalRecords - idx) 
      }));
      
      setRecords(mapped);
    });
    return () => unsubscribe();
  }, [selectedCatalog]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatalog) return;
    setIsProcessing(true);
    
    try {
      const colName = `catalog_${selectedCatalog.id}`;
      
      if (currentRecord) {
        await updateDoc(doc(db, colName, currentRecord.id), formData);
      } else {
        const counterRef = doc(db, 'counters', `seq_${colName}`);
        
        const nextSeq = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let newSeq = 1;
          
          if (counterDoc.exists()) {
            newSeq = (counterDoc.data().value || 0) + 1;
            transaction.update(counterRef, { value: newSeq });
          } else {
            transaction.set(counterRef, { value: 1 });
          }
          return newSeq;
        });

        await addDoc(collection(db, colName), { 
          ...formData, 
          seq: nextSeq, 
          createdAt: new Date().toISOString() 
        });
      }
      setModalState('closed');
    } catch (error) { 
      console.error("Error Saving Record:", error); 
      alert('Error saving record. Check console for details.'); 
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Delete this record?')) {
      await deleteDoc(doc(db, `catalog_${selectedCatalog!.id}`, id));
    }
  };

  const filteredRecords = records.filter(reg => {
    const searchLower = searchTerm.toLowerCase();
    return selectedCatalog?.fields.some(f => 
      String(reg[f.name] || '').toLowerCase().includes(searchLower)
    );
  });

  if (!selectedCatalog) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-header-text">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={28}/> System Catalogs
            </h2>
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
      <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: '1 1 200px' }}>
          <button className="icon-btn" onClick={() => setSelectedCatalog(null)} title="Back">
            <ArrowLeft size={24} color="var(--text-main)"/>
          </button>
          <div className="card-header-text">
            <h2 style={{ margin: 0 }}>{selectedCatalog.title}</h2>
          </div>
        </div>
        <div style={{ flex: '2 1 250px', display: 'flex', justifyContent: 'center' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', flex: '1 1 150px', justifyContent: 'flex-end' }}>
          <button 
            className="action btn-primary" 
            style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} 
            onClick={() => { setCurrentRecord(null); setFormData({}); setModalState('form'); }}
          >
            <Plus size={18}/> New Record
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '90px' }}>Actions</th>
              <th>#</th>
              {selectedCatalog.fields.map(f => (
                <th key={f.name}>
                  {/* 🔥 Reemplazo visual de Description a ADDRESS en la cabecera de la tabla */}
                  {f.name === 'description' && selectedCatalog.id === 'destinations' ? 'ADDRESS' : f.label.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={selectedCatalog.fields.length + 2} className="empty-state">
                  No records found.
                </td>
              </tr>
            )}
            {filteredRecords.map((reg) => (
              <tr key={reg.id}>
                <td data-label="Actions" style={{ textAlign: 'center' }}>
                  <div className="action-btns" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                    <button 
                      className="icon-btn edit" 
                      onClick={(e) => { e.stopPropagation(); setCurrentRecord(reg); setFormData(reg); setModalState('form'); }}
                    >
                      <Edit2 size={16}/>
                    </button>
                    <button 
                      className="icon-btn delete" 
                      onClick={(e) => handleDelete(reg.id, e)}
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </td>

                <td data-label="#"><SeqBadge seq={reg.visualSeq} /></td>
                
                {selectedCatalog.fields.map(f => (
                  <td key={f.name} data-label={f.label} style={{ fontWeight: f.name === 'description' ? 'bold' : 'normal' }}>
                    {reg[f.name] || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState !== 'closed' && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{currentRecord ? 'Edit Record' : 'New Record'}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                {modalState === 'form' && (
                  <button className="action btn-primary" onClick={handleSave} disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save'}
                  </button>
                )}
                <button className="close-modal icon-btn" onClick={() => setModalState('closed')} disabled={isProcessing}>
                  <X size={24}/>
                </button>
              </div>
            </div>
            
            {modalState === 'form' && (
              <form onSubmit={handleSave} style={{ paddingTop: '20px' }}>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.2rem' }}>
                  {selectedCatalog.fields.map(field => (
                    <div key={field.name} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                        {/* 🔥 Reemplazo visual de Description a Address en el formulario modal */}
                        {field.name === 'description' && selectedCatalog.id === 'destinations' ? 'Address' : field.label} {field.required && <span style={{color: 'red'}}>*</span>}
                      </label>
                      <input 
                        type="text" 
                        name={field.name} 
                        value={formData[field.name] || ''} 
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} 
                        required={field.required}
                        disabled={isProcessing}
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%' }}
                      />
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