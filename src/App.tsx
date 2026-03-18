import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase'; 
import { 
  PackageSearch, Briefcase, LogOut, 
  MapPin, ChevronLeft, ChevronRight, Edit2, Trash2, Plus, 
  X, ArrowLeft, Menu, Building2, BookOpen
} from 'lucide-react';
import './App.css';

// =========================================
// INTERFACES Y TIPOS GLOBALES
// =========================================
interface User { username: string; role: 'admin' | 'user'; }

interface JobOrder {
  id: string; 
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
  id?: string; jobOrderId: string; itemEntranceId: string; modelPart: string;
  serial: string; po: string; quantity: number; itemName: string;
}

interface ItemEntranceRecord {
  id: string; date: string; modelPart: string; serial: string; po: string;
  orderDate: string; quantityOrdered: number; itemsArrived: number; supplyCompany: string; itemName: string;
}

type JobFormData = Omit<JobOrder, 'id' | 'createdBy'>;
type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
type ItemEntranceFormData = Omit<ItemEntranceRecord, 'id'>;

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
// UTILIDADES
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
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
};

// Hook para cargar opciones de catálogo en tiempo real
const useCatalogOptions = (catalogId: string, labelField: string) => {
  const [options, setOptions] = useState<{id: string, label: string}[]>([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, `catalog_${catalogId}`), (snapshot) => {
      setOptions(snapshot.docs.map(doc => ({ id: doc.id, label: doc.data()[labelField] })));
    });
    return () => unsubscribe();
  }, [catalogId, labelField]);
  return options;
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
// MÓDULO: CATÁLOGOS (DASHBOARD DINÁMICO)
// =========================================
const CatalogsModule: React.FC = () => {
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogSchema | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [modalState, setModalState] = useState<'closed' | 'form' | 'detail'>('closed');
  const [currentRecord, setCurrentRecord] = useState<any | null>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (!selectedCatalog) return;
    const unsubscribe = onSnapshot(collection(db, `catalog_${selectedCatalog.id}`), (snapshot) => {
      setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [selectedCatalog]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const colName = `catalog_${selectedCatalog!.id}`;
      if (currentRecord) await updateDoc(doc(db, colName, currentRecord.id), formData);
      else await addDoc(collection(db, colName), formData);
      setModalState('closed');
    } catch (error) { 
      console.error("Error saving catalog data", error);
      alert('Error saving record.'); 
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this record?')) {
      await deleteDoc(doc(db, `catalog_${selectedCatalog!.id}`, id));
      setModalState('closed');
    }
  };

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
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="icon-btn" onClick={() => setSelectedCatalog(null)} title="Back to Catalogs"><ArrowLeft size={24} color="var(--text-main)"/></button>
          <div className="card-header-text">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{selectedCatalog.icon} {selectedCatalog.title}</h2>
            <p>Manage records for {selectedCatalog.title.toLowerCase()}.</p>
          </div>
        </div>
        <button className="action btn-primary" onClick={() => { setCurrentRecord(null); setFormData({}); setModalState('form'); }}>
          <Plus size={18}/> New Record
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {selectedCatalog.fields.map(f => (<th key={f.name}>{f.label}</th>))}
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan={selectedCatalog.fields.length + 1} className="empty-state">No records found.</td></tr>}
            {records.map((reg) => (
              <tr key={reg.id}>
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
                        <select 
                          name={field.name} 
                          value={formData[field.name] || ''} 
                          onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} 
                          required={field.required}
                        >
                          <option value="">Select...</option>
                          {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input 
                          type={field.type} 
                          name={field.name} 
                          value={formData[field.name] || ''} 
                          onChange={(e) => setFormData({...formData, [field.name]: e.target.value})} 
                          required={field.required} 
                        />
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
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Cargamos opciones desde catálogos
  const supplyCompanies = useCatalogOptions('supply_companies', 'company');

  const initialForm: ItemEntranceFormData = {
    date: getTodayString(), modelPart: '', serial: '', po: '', orderDate: '', 
    quantityOrdered: 0, itemsArrived: 0, supplyCompany: '', itemName: ''
  };
  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);

  const collectionRef = collection(db, "itemEntrance");

  const fetchItems = async () => {
    const data = await getDocs(collectionRef);
    setItems(data.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ItemEntranceRecord[]);
  };

  useEffect(() => { fetchItems(); }, []);

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
    if (editingId) await updateDoc(doc(db, "itemEntrance", editingId), { ...formData });
    else await addDoc(collectionRef, formData);
    fetchItems();
    setIsModalOpen(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PackageSearch size={24}/> Item Entrance</h2>
          <p>Register incoming products (Format: MM/DD/YYYY)</p>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}><Plus size={18}/> New Entrance</button>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr><th>Date</th><th>Model/Part #</th><th>Serial #</th><th>PO #</th><th>Order Date</th><th>Qty</th><th>Arrived</th><th>Company</th><th>Item Name</th><th style={{textAlign:'center'}}>Actions</th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{formatDateDisplay(item.date)}</td><td>{item.modelPart}</td><td>{item.serial}</td><td>{item.po}</td><td>{formatDateDisplay(item.orderDate)}</td><td>{item.quantityOrdered}</td><td>{item.itemsArrived}</td><td>{item.supplyCompany}</td><td style={{fontWeight: 'bold'}}>{item.itemName}</td>
                <td style={{ textAlign: 'center' }}>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(item)}><Edit2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <form onSubmit={handleSave}>
              <div className="modal-header">
                <h3>{editingId ? "Edit Entrance" : "New Entrance"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" className="action btn-primary">Save Changes</button>
                  <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Date (Registration)</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required /></div>
                <div className="form-group"><label>Item Name</label><input type="text" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} required /></div>
                <div className="form-group"><label>Model / Part #</label><input type="text" value={formData.modelPart} onChange={e => setFormData({...formData, modelPart: e.target.value})} required /></div>
                
                <div className="form-group">
                  <label>Supply Company</label>
                  <select value={formData.supplyCompany} onChange={e => setFormData({...formData, supplyCompany: e.target.value})} required>
                    <option value="">-- Select Company --</option>
                    {supplyCompanies.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                </div>

                <div className="form-group"><label>Order Date</label><input type="date" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})} required /></div>
                <div className="form-group"><label>Quantity Ordered</label><input type="number" value={formData.quantityOrdered} onChange={e => setFormData({...formData, quantityOrdered: Number(e.target.value)})} required /></div>
                <div className="form-group"><label>Items Arrived</label><input type="number" value={formData.itemsArrived} onChange={e => setFormData({...formData, itemsArrived: Number(e.target.value)})} required /></div>
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
  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<JobOrder | null>(null);
  const [viewProducts, setViewProducts] = useState<JobProduct[]>([]);
  const [showHistoric, setShowHistoric] = useState<boolean>(false); 

  // Cargamos opciones desde catálogo
  const destinations = useCatalogOptions('destinations', 'property_name');

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
      setOrders(orderData.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as JobOrder[]);
      const entranceData = await getDocs(entranceCollectionRef);
      setEntranceList(entranceData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ItemEntranceRecord[]);
    } catch (error) { console.error("Error", error); }
  };

  useEffect(() => { fetchData(); }, []);

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
      if (editingJob) await updateDoc(doc(db, "jobOrders", editingJob), { ...formData });
      else {
        const docRef = await addDoc(ordersCollectionRef, { ...formData, createdBy: currentUser.username });
        savedJobId = docRef.id;
      }
      for (const product of formProducts) {
        if (!product.id && savedJobId) await addDoc(productsCollectionRef, { ...product, jobOrderId: savedJobId });
      }
      fetchData(); 
      setIsJobModalOpen(false);
    } catch (error) { console.error("Error", error); }
  };

  const handleItemEntranceSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId) {
      const item = entranceList.find(i => i.id === selectedId);
      if (item) setCurrentProduct({ ...currentProduct, itemEntranceId: item.id, itemName: item.itemName, modelPart: item.modelPart, serial: item.serial, po: item.po });
    } else setCurrentProduct({ ...currentProduct, itemEntranceId: '', itemName: '', modelPart: '', serial: '', po: '' });
  };

  const handleAddProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (viewingJob) {
      const docRef = await addDoc(productsCollectionRef, { ...currentProduct, jobOrderId: viewingJob.id });
      setViewProducts([...viewProducts, { ...currentProduct, id: docRef.id, jobOrderId: viewingJob.id }]);
    } else setFormProducts([...formProducts, { ...currentProduct, jobOrderId: 'pending' }]); 
    setCurrentProduct({ itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '' });
    setIsProductModalOpen(false);
  };

  const displayedOrders = showHistoric 
    ? orders.filter(o => o.workFinish === 'YES') 
    : orders.filter(o => o.workFinish === 'NO');

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={24}/> {showHistoric ? 'Historic Records' : 'Work Activity'}
          </h2>
          <p>{showHistoric ? 'Completed orders' : 'Active job orders'}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="action" style={{ backgroundColor: showHistoric ? '#64748b' : '#3b82f6', color: 'white' }} onClick={() => setShowHistoric(!showHistoric)}>
            {showHistoric ? 'View Active' : 'Record'}
          </button>
          {!showHistoric && <button className="action btn-primary" onClick={() => handleOpenModal(null)}><Plus size={18}/> New Order</button>}
        </div>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Registration Date</th>
              <th>Ordered by</th>
              <th>Destination</th>
              <th>Description</th>
              <th style={{ textAlign: 'center' }}>Work Finish</th>
              <th>Pending Work</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.map(order => (
              <tr key={order.id} className="clickable-row" onClick={() => handleViewDetails(order)}>
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

      {viewingJob && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>Order Details</h3>
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
                  <thead><tr><th>Item Name</th><th>Model</th><th>Serial</th><th>Qty</th></tr></thead>
                  <tbody>
                    {viewProducts.map((p) => (
                      <tr key={p.id}><td>{p.itemName}</td><td>{p.modelPart}</td><td>{p.serial || '-'}</td><td>{p.quantity}</td></tr>
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
                  <button type="submit" className="action btn-primary">Save Order</button>
                  <button type="button" className="close-modal" onClick={() => setIsJobModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Registration Date</label><input type="date" value={formData.createdAt} onChange={e => setFormData({...formData, createdAt: e.target.value})} required /></div>
                
                <div className="form-group">
                  <label>Destination</label>
                  <select value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} required>
                    <option value="">-- Select Destination --</option>
                    {destinations.map(d => <option key={d.id} value={d.label}>{d.label}</option>)}
                  </select>
                </div>

                <div className="form-group"><label>Ordered by</label><input type="text" value={formData.jobOrder} onChange={e => setFormData({...formData, jobOrder: e.target.value})} required /></div>
                <div className="form-group"><label>Work Finish</label><select value={formData.workFinish} onChange={e => setFormData({...formData, workFinish: e.target.value as 'YES' | 'NO'})} required><option value="YES">YES</option><option value="NO">NO</option></select></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Description</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required /></div>
                <div className="form-group"><label>Schedule</label><input type="date" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} required /></div>
              </div>
              <div className="products-section">
                <div className="products-header">
                  <h4 style={{ margin: 0 }}>Products List</h4>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
                </div>
                <div className="table-container large-table">
                  <table>
                    <thead><tr><th>Item</th><th>Model</th><th>Qty</th><th>Action</th></tr></thead>
                    <tbody>
                      {formProducts.map((p, index) => (
                        <tr key={index}><td>{p.itemName}</td><td>{p.modelPart}</td><td>{p.quantity}</td><td><button type="button" className="btn-text-danger" onClick={() => setFormProducts(formProducts.filter((_, i) => i !== index))}>Remove</button></td></tr>
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
                  <button type="submit" className="action btn-primary">Add to List</button>
                  <button type="button" className="close-modal" onClick={() => setIsProductModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Select Item</label>
                  <select value={currentProduct.itemEntranceId} onChange={handleItemEntranceSelection} required>
                    <option value="">-- Choose item --</option>
                    {entranceList.map(item => (<option key={item.id} value={item.id}>{item.itemName} ({item.modelPart})</option>))}
                  </select>
                </div>
                <div className="form-group"><label>Quantity</label><input type="number" min="1" value={currentProduct.quantity} onChange={e => setCurrentProduct({...currentProduct, quantity: Number(e.target.value)})} required /></div>
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