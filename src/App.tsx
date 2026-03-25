import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase'; 
import { 
  PackageSearch, Briefcase, LogOut, Settings,
  MapPin, ChevronLeft, ChevronRight, Edit2, Trash2, Plus, 
  X, ArrowLeft, Menu, Building2, BookOpen, Search
} from 'lucide-react';
import './App.css';

// =========================================
// INTERFACES Y TIPOS GLOBALES
// =========================================
interface User { username: string; role: 'admin' | 'user'; }

interface JobOrder {
  id: string; 
  seq?: number; 
  visualSeq?: number; 
  jobOrder: string; 
  destination: string; 
  description: string;
  workFinish: 'YES' | 'NO'; 
  pendingWork: string; 
  schedule: string; 
  createdBy: string;
  createdAt: string; 
}

interface JobProduct {
  id?: string; 
  jobOrderId: string; 
  itemEntranceId: string; 
  modelPart: string;
  serial: string; 
  po: string; 
  quantity: number; 
  itemName: string;
}

interface ItemEntranceRecord {
  id: string; 
  seq?: number; 
  visualSeq?: number; 
  createdAt?: string; 
  date: string; 
  modelPart: string; 
  serial: string; 
  po: string;
  orderDate: string; 
  quantityOrdered: number; 
  itemsArrived: number; 
  supplyCompany: string; 
  itemName: string;
}

type JobFormData = Omit<JobOrder, 'id' | 'createdBy' | 'seq' | 'visualSeq'>;
type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
type ItemEntranceFormData = Omit<ItemEntranceRecord, 'id' | 'seq' | 'visualSeq' | 'createdAt'>;

// =========================================
// ESQUEMAS DE CATÁLOGOS
// =========================================
type FieldType = 'text' | 'number' | 'select';

interface CatalogField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

interface CatalogSchema {
  id: string;
  title: string;
  icon: React.ReactNode;
  fields: CatalogField[];
}

const catalogsConfig: Record<string, CatalogSchema> = {
  destinations: {
    id: 'destinations', 
    title: 'Destinations',
    icon: <MapPin size={32} />,
    fields: [
      { name: 'property_name', label: 'Property Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'contact', label: 'Contact', type: 'text' }
    ]
  },
  supply_companies: {
    id: 'supply_companies', 
    title: 'Supply Companies',
    icon: <Building2 size={32} />,
    fields: [
      { name: 'company', label: 'Company', type: 'text', required: true },
      { name: 'address', label: 'Address', type: 'text' }
    ]
  }
};

const catalogList = Object.values(catalogsConfig);

// =========================================
// UTILIDADES Y HOOKS
// =========================================
const getStatusStyles = (status: 'YES' | 'NO' | string) => ({
  backgroundColor: status === 'YES' ? '#edf7ed' : '#fdf0f0', 
  color: status === 'YES' ? '#1e4620' : '#d32f2f',
  padding: '6px 12px',
  borderRadius: '20px',
  fontSize: '0.75rem',
  fontWeight: 'bold',
  border: `1px solid ${status === 'YES' ? '#4caf50' : '#ef5350'}`,
  display: 'inline-block',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
});

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '-';
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${month}/${day}/${year}`;
    }
    return cleanDate;
  } catch { return dateStr; }
};

const formatSeq = (seq?: number) => {
  return String(seq || 0).padStart(3, '0');
};

const SeqBadge: React.FC<{ seq?: number }> = ({ seq }) => (
  <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.9rem' }}>
    {formatSeq(seq)}
  </span>
);

const thStyle = { color: '#64748b', fontWeight: '600', fontSize: '0.85rem', textTransform: 'uppercase' as const };

const useCatalogOptions = (catalogId: string, labelField: string) => {
  const [options, setOptions] = useState<{id: string, label: string}[]>([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, `catalog_${catalogId}`), (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, label: doc.data()[labelField] }));
      fetched.sort((a, b) => a.label.localeCompare(b.label));
      setOptions(fetched);
    });
    return () => unsubscribe();
  }, [catalogId, labelField]);
  return options;
};

const useFormConfig = (formKey: string, defaultRequired: string[]) => {
  const [requiredFields, setRequiredFields] = useState<string[]>(() => {
    const saved = localStorage.getItem(`formConfig_${formKey}`);
    return saved ? JSON.parse(saved) : defaultRequired;
  });

  const toggleRequired = (field: string) => {
    const newRequired = requiredFields.includes(field)
      ? requiredFields.filter(f => f !== field)
      : [...requiredFields, field];
    setRequiredFields(newRequired);
    localStorage.setItem(`formConfig_${formKey}`, JSON.stringify(newRequired));
  };

  const isRequired = (field: string) => requiredFields.includes(field);

  return { requiredFields, toggleRequired, isRequired };
};

// =========================================
// COMPONENTE: SELECTOR CON BUSCADOR
// =========================================
const SearchableSelect: React.FC<{
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
}> = ({ options, value, onChange, placeholder = "Search...", required }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selectedOpt = options.find(o => o.id === value);
    if (selectedOpt) setSearchTerm(selectedOpt.label);
    else setSearchTerm('');
  }, [value, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? searchTerm : (options.find(o => o.id === value)?.label || '')}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (e.target.value === '') onChange('');
          }}
          onFocus={() => setIsOpen(true)}
          required={required && !value}
          style={{
            width: '100%', padding: '10px 35px 10px 12px', border: '1px solid #cbd5e1',
            borderRadius: '6px', fontSize: '0.95rem', outline: 'none', color: '#334155'
          }}
        />
        <Search size={16} color="#94a3b8" style={{ position: 'absolute', right: '12px' }} />
      </div>
      
      {isOpen && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', 
          border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '4px', maxHeight: '220px', 
          overflowY: 'auto', zIndex: 100, listStyle: 'none', padding: 0, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
              <li
                key={opt.id}
                onMouseDown={() => {
                  onChange(opt.id);
                  setSearchTerm(opt.label);
                  setIsOpen(false);
                }}
                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#334155' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                {opt.label}
              </li>
            ))
          ) : (
            <li style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.9rem' }}>No results found...</li>
          )}
        </ul>
      )}
    </div>
  );
};

// =========================================
// COMPONENTE: BUSCADOR ELEGANTE Y CENTRADO
// =========================================
const SearchBar: React.FC<{ value: string, onChange: (val: string) => void }> = ({ value, onChange }) => (
  <div style={{ 
    display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', 
    borderRadius: '24px', padding: '6px 16px', gap: '8px', width: '100%', maxWidth: '450px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s ease'
  }}>
    <Search size={16} color="#94a3b8" />
    <input 
      type="text" placeholder="Search records..." value={value} onChange={e => onChange(e.target.value)} 
      style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.85rem', width: '100%', height: '20px' }} 
    />
  </div>
);

// =========================================
// COMPONENTE: MODAL DE CONFIGURACIÓN
// =========================================
const FieldConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  fields: { name: string; label: string }[];
  requiredFields: string[];
  toggleRequired: (f: string) => void;
}> = ({ isOpen, onClose, fields, requiredFields, toggleRequired }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay active" style={{ zIndex: 2000 }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={20}/> Required Fields</h3>
          <button type="button" className="close-modal" onClick={onClose}><X size={24}/></button>
        </div>
        <div style={{ padding: '15px 0' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
            Select which fields should be mandatory for this form.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fields.map(f => (
              <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" checked={requiredFields.includes(f.name)} onChange={() => toggleRequired(f.name)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="btn-container" style={{ marginTop: '20px' }}>
          <button type="button" className="action btn-primary" onClick={onClose} style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    </div>
  );
};

// =========================================
// COMPONENTE: PANTALLA DE AUTENTICACIÓN
// =========================================
const AuthScreen: React.FC<{ onLogin: (u: string, p: string) => void }> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) onLogin(username, password);
    else { alert("Registration submitted!\nWait for Admin approval."); setIsLogin(true); }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="catalog-icon" style={{ marginBottom: '15px' }}><Briefcase size={32} /></div>
        <h2>App Mr Natan</h2>
        <p className="subtitle">{isLogin ? "Welcome Back" : "Create Account"}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '15px' }}><label>Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="auth-btn">{isLogin ? 'Log In' : 'Sign Up'}</button>
        </form>
      </div>
    </div>
  );
};

// =========================================
// MÓDULO: CATÁLOGOS
// =========================================
const CatalogsModule: React.FC = () => {
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
          {catalogList.map((cat) => (
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
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>{selectedCatalog.icon} {selectedCatalog.title}</h2>
            <p style={{ margin: 0 }}>Manage records for {selectedCatalog.title.toLowerCase()}.</p>
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
        <table>
          <thead>
            <tr>
              <th style={{ width: '60px', ...thStyle }}>#</th>
              {selectedCatalog.fields.map(f => (<th key={f.name} style={thStyle}>{f.label}</th>))}
              <th style={{ textAlign: 'center', ...thStyle }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && <tr><td colSpan={selectedCatalog.fields.length + 2} className="empty-state">No records found.</td></tr>}
            {filteredRecords.map((reg) => (
              <tr key={reg.id}>
                <td><SeqBadge seq={reg.visualSeq} /></td>
                {selectedCatalog.fields.map(f => (
                  <td key={f.name} style={{ fontWeight: f.name === selectedCatalog.fields[0].name ? 'bold' : 'normal' }}>
                    {reg[f.name] || '-'}
                  </td>
                ))}
                <td style={{ textAlign: 'center' }}>
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
            {modalState === 'form' ? (
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
            ) : (
              <div className="details-grid" style={{ paddingTop: '15px' }}>
                {selectedCatalog.fields.map(f => (
                  <div key={f.name} className="detail-item full-width">
                    <span>{f.label}:</span> <p>{currentRecord[f.name] || '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================
// MÓDULO: ITEM ENTRANCE
// =========================================
const ItemEntrance: React.FC = () => {
  const [items, setItems] = useState<ItemEntranceRecord[]>([]);
  const [allJobProducts, setAllJobProducts] = useState<JobProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const supplyCompanies = useCatalogOptions('supply_companies', 'company');

  const entranceFields = [
    { name: 'date', label: 'Date (Registration)' },
    { name: 'itemName', label: 'Item Name' },
    { name: 'modelPart', label: 'Model / Part #' },
    { name: 'serial', label: 'Serial #' },
    { name: 'po', label: 'PO #' },
    { name: 'supplyCompany', label: 'Supply Company' },
    { name: 'orderDate', label: 'Order Date' },
    { name: 'quantityOrdered', label: 'Quantity Ordered' }
  ];
  const { requiredFields, toggleRequired, isRequired } = useFormConfig('itemEntrance', ['date', 'itemName', 'supplyCompany', 'quantityOrdered']);

  const initialForm: ItemEntranceFormData = {
    date: getTodayString(), modelPart: '', serial: '', po: '', orderDate: '', 
    quantityOrdered: 0, itemsArrived: 0, supplyCompany: '', itemName: ''
  };
  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);

  const collectionRef = collection(db, "itemEntrance");

  const fetchItems = async () => {
    const data = await getDocs(collectionRef);
    const fetched = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    fetched.sort((a: any, b: any) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());
    const mapped = fetched.map((item: any, idx: number) => ({ ...item, visualSeq: item.seq || (idx + 1) }));
    mapped.reverse(); 
    setItems(mapped as ItemEntranceRecord[]);

    const prodData = await getDocs(collection(db, "jobProducts"));
    setAllJobProducts(prodData.docs.map(doc => doc.data() as JobProduct));
  };

  useEffect(() => { fetchItems(); }, []);

  const getStock = (itemId: string, initialArrived: number) => {
    const used = allJobProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    return initialArrived - used;
  };

  const handleOpenModal = (item: ItemEntranceRecord | null = null) => {
    if (item) { 
      setEditingId(item.id); 
      setFormData(item); 
    } else { 
      setEditingId(null); 
      setFormData({ ...initialForm, date: getTodayString() }); 
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "itemEntrance", editingId), { ...formData });
      } else {
        const nextSeq = items.length > 0 ? Math.max(...items.map(i => i.visualSeq || 0)) + 1 : 1;
        await addDoc(collectionRef, { ...formData, seq: nextSeq, createdAt: new Date().toISOString() });
      }
      fetchItems();
      setIsModalOpen(false);
    } catch (error) { console.error("Error saving data", error); }
  };

  const filteredItems = items.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    return (
      String(item.itemName || '').toLowerCase().includes(searchLower) ||
      String(item.modelPart || '').toLowerCase().includes(searchLower) ||
      String(item.serial || '').toLowerCase().includes(searchLower) ||
      String(item.po || '').toLowerCase().includes(searchLower) ||
      String(item.supplyCompany || '').toLowerCase().includes(searchLower) ||
      formatDateDisplay(item.date).includes(searchLower)
    );
  });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PackageSearch size={24}/> Item Entrance</h2>
          <p>Register incoming products</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '150px' }}>
          <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
            <Plus size={18}/> New Entrance
          </button>
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '60px', ...thStyle }}>#</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Item Name</th>
              <th style={thStyle}>Model/Part #</th>
              <th style={thStyle}>Serial #</th>
              <th style={thStyle}>PO #</th>
              <th style={thStyle}>Company</th>
              <th style={thStyle}>Qty</th>
              <th style={thStyle}>Arrived (Stock)</th>
              <th style={thStyle}>Order Date</th>
              <th style={{ textAlign: 'center', ...thStyle }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && <tr><td colSpan={11} className="empty-state">No records found.</td></tr>}
            {filteredItems.map(item => {
              const currentStock = getStock(item.id, item.itemsArrived);
              return (
                <tr key={item.id}>
                  <td><SeqBadge seq={item.visualSeq} /></td>
                  <td>{formatDateDisplay(item.date)}</td>
                  <td style={{fontWeight: 'bold'}}>{item.itemName}</td>
                  <td>{item.modelPart || '-'}</td>
                  <td style={{fontWeight: '600'}}>{item.serial || '-'}</td>
                  <td style={{fontWeight: '600'}}>{item.po || '-'}</td>
                  <td>{item.supplyCompany || '-'}</td>
                  <td>{item.quantityOrdered}</td>
                  <td style={{ color: currentStock <= 0 ? '#ef4444' : 'inherit', fontWeight: currentStock <= 0 ? 'bold' : 'normal' }}>
                    {currentStock}
                  </td>
                  <td>{formatDateDisplay(item.orderDate)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="action-btns">
                      <button className="icon-btn edit" onClick={() => handleOpenModal(item)}><Edit2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FieldConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} fields={entranceFields} requiredFields={requiredFields} toggleRequired={toggleRequired} />

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <form onSubmit={handleSave}>
              <div className="modal-header">
                <h3>{editingId ? "Edit Entrance" : "New Entrance"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="icon-btn" onClick={() => setIsConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary">Save Changes</button>
                  <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Date (Registration) {isRequired('date') && '*'}</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required={isRequired('date')} /></div>
                <div className="form-group"><label>Item Name {isRequired('itemName') && '*'}</label><input type="text" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} required={isRequired('itemName')} /></div>
                <div className="form-group"><label>Model / Part # {isRequired('modelPart') && '*'}</label><input type="text" value={formData.modelPart} onChange={e => setFormData({...formData, modelPart: e.target.value})} required={isRequired('modelPart')} /></div>
                <div className="form-group"><label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Serial # {isRequired('serial') && '*'}</label><input type="text" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} required={isRequired('serial')} /></div>
                <div className="form-group"><label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>PO # {isRequired('po') && '*'}</label><input type="text" value={formData.po} onChange={e => setFormData({...formData, po: e.target.value})} required={isRequired('po')} /></div>
                <div className="form-group">
                  <label>Supply Company {isRequired('supplyCompany') && '*'}</label>
                  <select value={formData.supplyCompany} onChange={e => setFormData({...formData, supplyCompany: e.target.value})} required={isRequired('supplyCompany')}>
                    <option value="">-- Select Company --</option>
                    {supplyCompanies.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Order Date {isRequired('orderDate') && '*'}</label><input type="date" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})} required={isRequired('orderDate')} /></div>
                <div className="form-group"><label>Quantity Ordered {isRequired('quantityOrdered') && '*'}</label><input type="number" value={formData.quantityOrdered} onChange={e => setFormData({...formData, quantityOrdered: Number(e.target.value)})} required={isRequired('quantityOrdered')} /></div>
                <div className="form-group"><label>Items Arrived (Initial Total)</label><input type="number" value={formData.itemsArrived} onChange={e => setFormData({...formData, itemsArrived: Number(e.target.value)})} /></div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================
// MÓDULO: WORK ACTIVITY
// =========================================
const WorkActivity: React.FC<{currentUser: User}> = ({ currentUser }) => {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [entranceList, setEntranceList] = useState<ItemEntranceRecord[]>([]); 
  const [allJobProducts, setAllJobProducts] = useState<JobProduct[]>([]);

  const [searchTerm, setSearchTerm] = useState(''); 
  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [isJobConfigOpen, setIsJobConfigOpen] = useState<boolean>(false);
  const [isProductConfigOpen, setIsProductConfigOpen] = useState<boolean>(false);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<JobOrder | null>(null);
  const [viewProducts, setViewProducts] = useState<JobProduct[]>([]);
  const [showHistoric, setShowHistoric] = useState<boolean>(false); 

  const destinations = useCatalogOptions('destinations', 'property_name');

  const jobFields = [
    { name: 'createdAt', label: 'Registration Date' },
    { name: 'destination', label: 'Destination' },
    { name: 'jobOrder', label: 'Ordered by' },
    { name: 'workFinish', label: 'Work Finish' },
    { name: 'description', label: 'Description' },
    { name: 'pendingWork', label: 'Pending Work' },
    { name: 'schedule', label: 'Schedule' }
  ];
  const { requiredFields: reqJob, toggleRequired: toggleJobReq, isRequired: isJobReq } = useFormConfig('jobOrder', ['createdAt', 'destination', 'jobOrder', 'workFinish']);

  const productFields = [
    { name: 'itemEntranceId', label: 'Select Item' },
    { name: 'quantity', label: 'Quantity' }
  ];
  const { requiredFields: reqProd, toggleRequired: toggleProdReq, isRequired: isProdReq } = useFormConfig('addProduct', ['itemEntranceId', 'quantity']);

  const initialFormState: JobFormData = {
    jobOrder: '', destination: '', description: '', workFinish: 'NO', pendingWork: '', schedule: '', createdAt: getTodayString()
  };
  const [formData, setFormData] = useState<JobFormData>(initialFormState);
  const [formProducts, setFormProducts] = useState<JobProduct[]>([]);
  
  const [currentProduct, setCurrentProduct] = useState<ProductFormData>({
    itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: ''
  });

  const ordersCollectionRef = collection(db, "jobOrders");
  const productsCollectionRef = collection(db, "jobProducts");
  const entranceCollectionRef = collection(db, "itemEntrance"); 

  const fetchData = async () => {
    try {
      const orderData = await getDocs(ordersCollectionRef);
      const fetchedOrders = orderData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as any));
      fetchedOrders.sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      const mappedOrders = fetchedOrders.map((o: any, idx: number) => ({ ...o, visualSeq: o.seq || (idx + 1) }));
      mappedOrders.reverse(); 
      setOrders(mappedOrders as JobOrder[]);

      const entranceData = await getDocs(entranceCollectionRef);
      setEntranceList(entranceData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ItemEntranceRecord[]);

      const productsData = await getDocs(productsCollectionRef);
      setAllJobProducts(productsData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } catch (error) { console.error("Error", error); }
  };

  useEffect(() => { fetchData(); }, []);

  const getAvailableStock = (itemId: string) => {
    const item = entranceList.find(i => i.id === itemId);
    if (!item) return 0;
    const usedInDB = allJobProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    const usedInForm = formProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    return item.itemsArrived - usedInDB - usedInForm;
  };

  const handleViewDetails = async (job: JobOrder) => {
    setViewingJob(job);
    try {
      const q = query(productsCollectionRef, where("jobOrderId", "==", job.id));
      const querySnapshot = await getDocs(q);
      setViewProducts(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } catch (error) { console.error("Error", error); }
  };

  const handleOpenModal = async (job: JobOrder | null = null) => {
    setViewingJob(null); 
    if (job) {
      setEditingJob(job.id);
      setFormData({ 
        jobOrder: job.jobOrder, 
        destination: job.destination, 
        description: job.description, 
        workFinish: job.workFinish, 
        pendingWork: job.pendingWork, 
        schedule: job.schedule,
        createdAt: job.createdAt || getTodayString()
      });
      const q = query(productsCollectionRef, where("jobOrderId", "==", job.id));
      const querySnapshot = await getDocs(q);
      setFormProducts(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } else {
      setEditingJob(null);
      setFormData({ ...initialFormState, createdAt: getTodayString() });
      setFormProducts([]);
    }
    setIsJobModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("⚠️ Delete record?")) {
      await deleteDoc(doc(db, "jobOrders", id));
      setViewingJob(null);
      fetchData(); 
    }
  };

  const handleSaveOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      let savedJobId = editingJob;
      if (editingJob) {
        await updateDoc(doc(db, "jobOrders", editingJob), { ...formData });
      } else {
        const nextSeq = orders.length > 0 ? Math.max(...orders.map(o => o.visualSeq || 0)) + 1 : 1;
        const docRef = await addDoc(ordersCollectionRef, { ...formData, createdBy: currentUser.username, seq: nextSeq });
        savedJobId = docRef.id;
      }
      for (const product of formProducts) {
        if (!product.id && savedJobId) await addDoc(productsCollectionRef, { ...product, jobOrderId: savedJobId });
      }
      fetchData(); 
      setIsJobModalOpen(false);
    } catch (error) { console.error("Error", error); }
  };

  const handleItemEntranceSelection = (selectedId: string) => {
    if (selectedId) {
      const item = entranceList.find(i => i.id === selectedId);
      if (item) setCurrentProduct({ ...currentProduct, itemEntranceId: item.id, itemName: item.itemName, modelPart: item.modelPart, serial: item.serial, po: item.po });
    } else setCurrentProduct({ ...currentProduct, itemEntranceId: '', itemName: '', modelPart: '', serial: '', po: '' });
  };

  const handleAddProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const availableStock = getAvailableStock(currentProduct.itemEntranceId);
    if (availableStock <= 0 || currentProduct.quantity > availableStock) {
      alert("There is no stock of this product. Please update the stock.");
      return;
    }

    if (viewingJob) {
      const docRef = await addDoc(productsCollectionRef, { ...currentProduct, jobOrderId: viewingJob.id });
      setViewProducts([...viewProducts, { ...currentProduct, id: docRef.id, jobOrderId: viewingJob.id }]);
      fetchData();
    } else {
      setFormProducts([...formProducts, { ...currentProduct, jobOrderId: 'pending' }]); 
    }
    setCurrentProduct({ itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '' });
    setIsProductModalOpen(false);
  };

  const handleRemoveProductFromDetails = async (productId: string) => {
    if(window.confirm("Delete product?")) {
      await deleteDoc(doc(db, "jobProducts", productId));
      setViewProducts(viewProducts.filter(p => p.id !== productId));
      fetchData(); 
    }
  };

  const displayedOrders = (showHistoric 
    ? orders.filter(o => o.workFinish === 'YES') 
    : orders.filter(o => o.workFinish === 'NO')
  ).filter(order => {
    const searchLower = searchTerm.toLowerCase();
    return (
      String(order.jobOrder || '').toLowerCase().includes(searchLower) ||
      String(order.destination || '').toLowerCase().includes(searchLower) ||
      String(order.description || '').toLowerCase().includes(searchLower) ||
      String(order.pendingWork || '').toLowerCase().includes(searchLower) ||
      formatDateDisplay(order.createdAt).includes(searchLower) ||
      formatDateDisplay(order.schedule).includes(searchLower)
    );
  });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={24}/> {showHistoric ? 'Historic Records' : 'Work Activity'}
          </h2>
          <p>{showHistoric ? 'Completed orders' : 'Active job orders'}</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '200px' }}>
          <button className="action btn-primary" style={{ backgroundColor: showHistoric ? '#64748b' : 'var(--primary-color)', height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => setShowHistoric(!showHistoric)}>
            {showHistoric ? 'View Active' : 'Record'}
          </button>
          {!showHistoric && (
            <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
              <Plus size={18}/> New Order
            </button>
          )}
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '60px', ...thStyle }}>#</th>
              <th style={thStyle}>Registration Date</th>
              <th style={thStyle}>Ordered by</th>
              <th style={thStyle}>Destination</th>
              <th style={thStyle}>Description</th>
              <th style={{ textAlign: 'center', ...thStyle }}>Work Finish</th>
              <th style={thStyle}>Pending Work</th>
              <th style={thStyle}>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.length === 0 && <tr><td colSpan={8} className="empty-state">No records found.</td></tr>}
            {displayedOrders.map(order => (
              <tr key={order.id} className="clickable-row" onClick={() => handleViewDetails(order)}>
                <td><SeqBadge seq={order.visualSeq} /></td>
                <td>{formatDateDisplay(order.createdAt)}</td>
                <td style={{ fontWeight: 'bold' }}>{order.jobOrder}</td>
                <td>{order.destination}</td>
                <td>{order.description}</td>
                <td style={{ textAlign: 'center' }}><span style={getStatusStyles(order.workFinish)}>{order.workFinish}</span></td>
                <td>{order.pendingWork || '-'}</td>
                <td>{formatDateDisplay(order.schedule)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FieldConfigModal isOpen={isJobConfigOpen} onClose={() => setIsJobConfigOpen(false)} fields={jobFields} requiredFields={reqJob} toggleRequired={toggleJobReq} />
      <FieldConfigModal isOpen={isProductConfigOpen} onClose={() => setIsProductConfigOpen(false)} fields={productFields} requiredFields={reqProd} toggleRequired={toggleProdReq} />

      {viewingJob && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SeqBadge seq={viewingJob.visualSeq} /> Order Details
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="action btn-primary" onClick={() => handleOpenModal(viewingJob)}><Edit2 size={16}/> Edit</button>
                <button className="action btn-danger" onClick={() => handleDelete(viewingJob.id)}><Trash2 size={16}/> Delete</button>
                <button className="close-modal" onClick={() => setViewingJob(null)}><X size={24}/></button>
              </div>
            </div>
            <div className="details-grid">
              <div className="detail-item"><span>Registration Date:</span> <p>{formatDateDisplay(viewingJob.createdAt)}</p></div>
              <div className="detail-item"><span>Destination:</span> <p>{viewingJob.destination}</p></div>
              <div className="detail-item"><span>Ordered by:</span> <p>{viewingJob.jobOrder}</p></div>
              <div className="detail-item"><span>Schedule:</span> <p>{formatDateDisplay(viewingJob.schedule)}</p></div>
              <div className="detail-item"><span>Status:</span> <p><span style={getStatusStyles(viewingJob.workFinish)}>{viewingJob.workFinish}</span></p></div>
              <div className="detail-item full-width"><span>Description:</span> <p>{viewingJob.description}</p></div>
            </div>
            <div className="products-section">
              <div className="products-header">
                <h4 style={{ margin: 0 }}>Associated Products / Materials</h4>
                <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
              </div>
              <div className="table-container large-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '50px', ...thStyle }}>#</th>
                      <th style={thStyle}>Item Name</th>
                      <th style={thStyle}>Model</th>
                      <th style={thStyle}>Serial</th>
                      <th style={thStyle}>Qty</th>
                      <th style={{ textAlign: 'center', ...thStyle }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewProducts.length === 0 && <tr><td colSpan={6} className="empty-state">No products attached.</td></tr>}
                    {viewProducts.map((p, i) => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{formatSeq(i + 1)}</td>
                        <td>{p.itemName}</td><td>{p.modelPart}</td><td>{p.serial || '-'}</td><td>{p.quantity}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className="btn-text-danger" onClick={() => handleRemoveProductFromDetails(p.id!)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {isJobModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <form onSubmit={handleSaveOrder}>
              <div className="modal-header">
                <h3>{editingJob ? "Edit Order" : "Create New Order"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="icon-btn" onClick={() => setIsJobConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary">Save Order</button>
                  <button type="button" className="close-modal" onClick={() => setIsJobModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Registration Date {isJobReq('createdAt') && '*'}</label><input type="date" value={formData.createdAt} onChange={e => setFormData({...formData, createdAt: e.target.value})} required={isJobReq('createdAt')} /></div>
                
                <div className="form-group">
                  <label>Destination {isJobReq('destination') && '*'}</label>
                  <select value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} required={isJobReq('destination')}>
                    <option value="">-- Select Destination --</option>
                    {destinations.map(d => <option key={d.id} value={d.label}>{d.label}</option>)}
                  </select>
                </div>

                <div className="form-group"><label>Ordered by {isJobReq('jobOrder') && '*'}</label><input type="text" value={formData.jobOrder} onChange={e => setFormData({...formData, jobOrder: e.target.value})} required={isJobReq('jobOrder')} /></div>
                <div className="form-group"><label>Work Finish {isJobReq('workFinish') && '*'}</label><select value={formData.workFinish} onChange={e => setFormData({...formData, workFinish: e.target.value as 'YES' | 'NO'})} required={isJobReq('workFinish')}><option value="YES">YES</option><option value="NO">NO</option></select></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Description {isJobReq('description') && '*'}</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required={isJobReq('description')} /></div>
                <div className="form-group"><label>Schedule {isJobReq('schedule') && '*'}</label><input type="date" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} required={isJobReq('schedule')} /></div>
                <div className="form-group"><label>Pending Work {isJobReq('pendingWork') && '*'}</label><input type="text" value={formData.pendingWork} onChange={e => setFormData({...formData, pendingWork: e.target.value})} required={isJobReq('pendingWork')} /></div>
              </div>
              <div className="products-section">
                <div className="products-header">
                  <h4 style={{ margin: 0 }}>Products List</h4>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
                </div>
                <div className="table-container large-table">
                  <table>
                    <thead><tr><th style={{ width: '50px', ...thStyle }}>#</th><th style={thStyle}>Item</th><th style={thStyle}>Model</th><th style={thStyle}>Qty</th><th style={thStyle}>Action</th></tr></thead>
                    <tbody>
                      {formProducts.length === 0 && <tr><td colSpan={5} className="empty-state">No products added. Click "+ Add Product".</td></tr>}
                      {formProducts.map((p, index) => (
                        <tr key={index}>
                          <td style={{ color: 'var(--text-muted)' }}>{formatSeq(index + 1)}</td>
                          <td>{p.itemName}</td><td>{p.modelPart}</td><td>{p.quantity}</td>
                          <td><button type="button" className="btn-text-danger" onClick={() => setFormProducts(formProducts.filter((_, i) => i !== index))}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <form onSubmit={handleAddProductSubmit}>
              <div className="modal-header">
                <h3>Add Product</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="icon-btn" onClick={() => setIsProductConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary">Add to List</button>
                  <button type="button" className="close-modal" onClick={() => setIsProductModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Select Item {isProdReq('itemEntranceId') && '*'}</label>
                  <SearchableSelect 
                    options={entranceList.map(item => ({ 
                      id: item.id, 
                      label: `${item.itemName} (${item.modelPart || 'No Model'}) - Stock: ${getAvailableStock(item.id)}` 
                    }))}
                    value={currentProduct.itemEntranceId} 
                    onChange={handleItemEntranceSelection} 
                    placeholder="-- Type to search item --"
                    required={isProdReq('itemEntranceId')}
                  />
                </div>
                <div className="form-group"><label>Quantity {isProdReq('quantity') && '*'}</label><input type="number" min="1" value={currentProduct.quantity} onChange={e => setCurrentProduct({...currentProduct, quantity: Number(e.target.value)})} required={isProdReq('quantity')} /></div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================
// COMPONENTE PRINCIPAL (App)
// =========================================
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<string>('workActivity'); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const handleLogin = (u: string) => setCurrentUser({ username: u, role: 'user' });

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const handleModuleChange = (module: string) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>
      
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon"><Briefcase size={24} /></div>
            {!isSidebarCollapsed && <span className="logo-text">Mr Natan</span>}
          </div>
          <button type="button" className="collapse-btn desktop-only" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
            {isSidebarCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
          </button>
        </div>
        <ul className="nav-links">
          <li className={activeModule === 'workActivity' ? 'active' : ''} onClick={() => handleModuleChange('workActivity')}>
            <Briefcase size={20}/> <span>Work Activity</span>
          </li>
          <li className={activeModule === 'itemEntrance' ? 'active' : ''} onClick={() => handleModuleChange('itemEntrance')}>
            <PackageSearch size={20}/> <span>Item Entrance</span>
          </li>
          <li className={activeModule === 'catalogs' ? 'active' : ''} onClick={() => handleModuleChange('catalogs')}>
            <BookOpen size={20}/> <span>Catalogs</span>
          </li>
        </ul>
        <div className="sidebar-footer">
          <button type="button" className="action logout-btn" onClick={() => setCurrentUser(null)}>
            <LogOut size={20}/> <span>Log Out</span>
          </button>
        </div>
      </aside>
      
      <div className="main-wrapper">
        <div className="mobile-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <Briefcase size={24} /> <h2>Mr Natan</h2>
          </div>
          <button type="button" className="icon-btn" style={{color: 'white'}} onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={28}/>
          </button>
        </div>

        <main className="main-content">
          {activeModule === 'workActivity' && <WorkActivity currentUser={currentUser} />}
          {activeModule === 'itemEntrance' && <ItemEntrance />}
          {activeModule === 'catalogs' && <CatalogsModule />}
        </main>
      </div>
    </div>
  );
}