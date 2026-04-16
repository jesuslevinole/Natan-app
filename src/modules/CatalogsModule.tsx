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

  // Suscripción en tiempo real a la colección dinámica
  useEffect(() => {
    if (!selectedCatalog) return;
    const unsubscribe = onSnapshot(collection(db, `catalog_${selectedCatalog.id}`), (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      fetched.sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      // Inyección del consecutivo visual basado en el índice o sec guardado
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
        // Actualización de registro existente
        await updateDoc(doc(db, colName, currentRecord.id), formData);
      } else {
        // Captura automática de consecutivo y creación
        const nextSeq = records.length > 0 ? Math.max(...records.map(r => r.visualSeq || 0)) + 1 : 1;
        await addDoc(collection(db, colName), { 
          ...formData, 
          seq: nextSeq, 
          createdAt: new Date().toISOString() 
        });
      }
      setModalState('closed');
    } catch (error) { 
      console.error("Error Saving Record:", error); 
      alert('Error saving record.'); 
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

  // Renderizado del menú de catálogos si no hay uno seleccionado
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

  // Renderizado de la vista de gestión del catálogo seleccionado
  return (
    <div className="card catalog-manager-anim">
      {/* HEADER RESPONSIVO */}
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

      {/* TABLA DATA-DRIVEN RESPONSIVA */}
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
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={selectedCatalog.fields.length + 2} className="empty-state">
                  No records found.
                </td>
              </tr>
            )}
            {filteredRecords.map((reg) => (
              <tr key={reg.id}>
                {/* Consecutivo automático */}
                <td data-label="#"><SeqBadge seq={reg.visualSeq} /></td>
                
                {/* Iteración de campos dinámicos (ahora solo 'Description') */}
                {selectedCatalog.fields.map(f => (
                  <td key={f.name} data-label={f.label} style={{ fontWeight: f.name === 'description' ? 'bold' : 'normal' }}>
                    {reg[f.name] || '-'}
                  </td>
                ))}
                
                {/* Acciones */}
                <td data-label="Actions" style={{ textAlign: 'center' }}>
                  <div className="action-btns" style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                    <button className="icon-btn edit" onClick={() => { setCurrentRecord(reg); setFormData(reg); setModalState('form'); }}>
                      <Edit2 size={16}/>
                    </button>
                    <button className="icon-btn delete" onClick={() => handleDelete(reg.id)}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL CON CSS GRID */}
      {modalState !== 'closed' && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{currentRecord ? 'Edit Record' : 'New Record'}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                {modalState === 'form' && <button className="action btn-primary" onClick={handleSave}>Save</button>}
                <button className="close-modal icon-btn" onClick={() => setModalState('closed')}>
                  <X size={24}/>
                </button>
              </div>
            </div>
            
            {modalState === 'form' && (
              <form onSubmit={handleSave} style={{ paddingTop: '20px' }}>
                {/* Estructura Grid: 1 columna */}
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.2rem' }}>
                  {selectedCatalog.fields.map(field => (
                    <div key={field.name} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                        {field.label} {field.required && <span style={{color: 'red'}}>*</span>}
                      </label>
                      <input 
                        type="text" 
                        name={field.name} 
                        value={formData[field.name] || ''} 
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} 
                        required={field.required}
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