import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from './firebase'; 
import { 
  PackageSearch, Briefcase, Settings, LogOut, 
  MapPin, Truck, ChevronLeft, ChevronRight, Edit2, Trash2, Plus, 
  X, ArrowLeft, Menu
} from 'lucide-react';
import './App.css';

// =========================================
// INTERFACES Y TIPOS
// =========================================
interface User { username: string; role: 'admin' | 'user'; }

interface JobOrder {
  id: string; jobOrder: string; destination: string; description: string;
  workFinish: 'YES' | 'NO'; pendingWork: string; schedule: string; createdBy: string;
}

interface JobProduct {
  id?: string; jobOrderId: string; itemEntranceId: string; modelPart: string;
  serial: string; po: string; quantity: number; itemName: string; destination: string;
}

interface ItemEntranceRecord {
  id: string; date: string; modelPart: string; serial: string; po: string;
  orderDate: string; quantityOrdered: number; itemsArrived: number; supplyCompany: string; itemName: string;
}

// INTERFAZ PARA CATÁLOGOS GENÉRICOS
interface CatalogItem {
  id: string; name: string; description: string;
}

type JobFormData = Omit<JobOrder, 'id' | 'createdBy'>;
type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
type ItemEntranceFormData = Omit<ItemEntranceRecord, 'id'>;
type CatalogFormData = Omit<CatalogItem, 'id'>;

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
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
          <div className="catalog-icon" style={{ marginBottom: 0 }}><Briefcase size={32} /></div>
        </div>
        <h2>App Mr Natan</h2>
        <p className="subtitle">{isLogin ? "Test Mode: Any credentials work." : "Create a new account"}</p>
        <form onSubmit={handleSubmit}>
          {!isLogin && (<div className="form-group" style={{ marginBottom: '15px' }}><label>Full Name</label><input type="text" required /></div>)}
          <div className="form-group" style={{ marginBottom: '15px' }}><label>Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="auth-btn">{isLogin ? 'Log In' : 'Sign Up'}</button>
        </form>
        <p className="toggle-auth" onClick={() => setIsLogin(!isLogin)}>{isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}</p>
      </div>
    </div>
  );
};

// =========================================
// NUEVO COMPONENTE: GESTOR DE CATÁLOGOS (CRUD GENÉRICO)
// =========================================
const CatalogManager: React.FC<{ title: string, collectionName: string, icon: React.ReactNode, onBack: () => void }> = ({ title, collectionName, icon, onBack }) => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<CatalogItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CatalogFormData>({ name: '', description: '' });

  const colRef = collection(db, collectionName);

  const fetchItems = async () => {
    const data = await getDocs(colRef);
    setItems(data.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CatalogItem[]);
  };

  useEffect(() => { fetchItems(); }, [collectionName]);

  const handleOpenModal = (item: CatalogItem | null = null) => {
    setViewingItem(null);
    if (item) { setEditingId(item.id); setFormData({ name: item.name, description: item.description }); } 
    else { setEditingId(null); setFormData({ name: '', description: '' }); }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("⚠️ Delete this record?")) {
      await deleteDoc(doc(db, collectionName, id));
      setViewingItem(null);
      fetchItems();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) await updateDoc(doc(db, collectionName, editingId), { ...formData });
    else await addDoc(colRef, formData);
    fetchItems();
    setIsModalOpen(false);
  };

  return (
    <div className="card catalog-manager-anim">
      <div className="card-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="icon-btn" onClick={onBack} title="Back to Settings"><ArrowLeft size={24} color="var(--text-main)"/></button>
          <div className="card-header-text">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{icon} {title} Catalog</h2>
            <p>Manage list options for the system.</p>
          </div>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}><Plus size={18}/> New {title}</button>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Name</th><th>Description</th><th style={{textAlign:'center'}}>Actions</th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={3} className="empty-state">No records found.</td></tr>}
            {items.map(item => (
              <tr key={item.id} className="clickable-row" onClick={() => setViewingItem(item)}>
                <td style={{ fontWeight: 'bold' }}>{item.name}</td>
                <td>{item.description || '-'}</td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(item)}><Edit2 size={16}/></button>
                    <button className="icon-btn delete" onClick={() => handleDelete(item.id)}><Trash2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewingItem && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{title} Details</h3>
              <button className="close-modal" onClick={() => setViewingItem(null)}><X size={24}/></button>
            </div>
            <div className="details-grid">
              <div className="detail-item full-width"><span>Name:</span> <p>{viewingItem.name}</p></div>
              <div className="detail-item full-width"><span>Description:</span> <p>{viewingItem.description || 'No description provided.'}</p></div>
            </div>
            <div className="btn-container modal-footer-actions">
              <button className="action btn-danger" onClick={() => handleDelete(viewingItem.id)}><Trash2 size={18}/> Delete</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="action btn-secondary" onClick={() => setViewingItem(null)}>Close</button>
                <button className="action btn-primary" onClick={() => handleOpenModal(viewingItem)}><Edit2 size={18}/> Edit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000 }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingId ? `Edit ${title}` : `New ${title}`}</h3>
              <button className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group full-width"><label>Name</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                <div className="form-group full-width"><label>Description</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
              </div>
              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary">Save {title}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================
// MÓDULO: SETTINGS / CATALOGS
// =========================================
const SettingsModule: React.FC = () => {
  const [activeCatalog, setActiveCatalog] = useState<{title: string, collection: string, icon: React.ReactNode} | null>(null);

  const catalogs = [
    { id: 'destinations', title: 'Destinations', collection: 'destinations', icon: <MapPin size={32}/> },
    { id: 'supplies', title: 'Supply Companies', collection: 'supplies', icon: <Truck size={32}/> },
  ];

  if (activeCatalog) {
    return <CatalogManager title={activeCatalog.title} collectionName={activeCatalog.collection} icon={activeCatalog.icon} onBack={() => setActiveCatalog(null)} />
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={28}/> Settings & Catalogs</h2>
          <p>Manage your system parameters and lists.</p>
        </div>
      </div>
      <div className="catalog-grid">
        {catalogs.map(cat => (
          <div key={cat.id} className="catalog-card" onClick={() => setActiveCatalog(cat)}>
            <div className="catalog-icon">{cat.icon}</div>
            <h3>{cat.title}</h3>
          </div>
        ))}
      </div>
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

  const initialForm: ItemEntranceFormData = {
    date: '', modelPart: '', serial: '', po: '', orderDate: '', 
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
      setFormData(initialForm);
    }
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("⚠️ Delete this record permanently?")) {
      await deleteDoc(doc(db, "itemEntrance", id));
      fetchItems();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(doc(db, "itemEntrance", editingId), { ...formData });
    } else {
      await addDoc(collectionRef, formData);
    }
    fetchItems();
    setIsModalOpen(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PackageSearch size={24}/> Item Entrance</h2>
          <p>Register and manage incoming products and materials.</p>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}><Plus size={18}/> New Entrance</button>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Model/Part #</th><th>Serial #</th><th>PO #</th>
              <th>Order Date</th><th>Qty Ordered</th><th>Items Arrived</th>
              <th>Supply Company</th><th>Item Name</th><th style={{textAlign:'center'}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={10} className="empty-state">No items registered yet.</td></tr>}
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.date}</td><td>{item.modelPart}</td><td>{item.serial}</td><td>{item.po}</td>
                <td>{item.orderDate}</td><td>{item.quantityOrdered}</td><td>{item.itemsArrived}</td>
                <td>{item.supplyCompany}</td><td style={{fontWeight: 'bold'}}>{item.itemName}</td>
                <td>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(item)}><Edit2 size={16}/></button>
                    <button className="icon-btn delete" onClick={() => handleDelete(item.id)}><Trash2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000 }}>
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>{editingId ? "Edit Item Entrance" : "Add New Item Entrance"}</h3>
              <button className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group"><label>Date</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required /></div>
                <div className="form-group"><label>Item Name</label><input type="text" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} required placeholder="Ej: Vidrio, Madera..." /></div>
                <div className="form-group"><label>Model / Part #</label><input type="text" value={formData.modelPart} onChange={e => setFormData({...formData, modelPart: e.target.value})} required /></div>
                <div className="form-group"><label>Serial #</label><input type="text" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} /></div>
                <div className="form-group"><label>PO #</label><input type="text" value={formData.po} onChange={e => setFormData({...formData, po: e.target.value})} /></div>
                <div className="form-group"><label>Supply Company</label><input type="text" value={formData.supplyCompany} onChange={e => setFormData({...formData, supplyCompany: e.target.value})} required /></div>
                <div className="form-group"><label>Order Date</label><input type="date" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})} required /></div>
                <div className="form-group"><label>Quantity Ordered</label><input type="number" min="0" value={formData.quantityOrdered} onChange={e => setFormData({...formData, quantityOrdered: Number(e.target.value)})} required /></div>
                <div className="form-group"><label>Items Arrived</label><input type="number" min="0" value={formData.itemsArrived} onChange={e => setFormData({...formData, itemsArrived: Number(e.target.value)})} required /></div>
              </div>
              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary">Save Record</button>
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
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<JobOrder | null>(null);
  const [viewProducts, setViewProducts] = useState<JobProduct[]>([]);

  const initialFormState: JobFormData = {
    jobOrder: '', destination: '', description: '', workFinish: 'NO', pendingWork: '', schedule: ''
  };
  const [formData, setFormData] = useState<JobFormData>(initialFormState);
  const [formProducts, setFormProducts] = useState<JobProduct[]>([]);
  
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [currentProduct, setCurrentProduct] = useState<ProductFormData>({
    itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '', destination: ''
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

  const visibleOrders = currentUser.role === 'admin' 
    ? orders : orders.filter(o => o.createdBy === currentUser.username);

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
        jobOrder: job.jobOrder, destination: job.destination, description: job.description, 
        workFinish: job.workFinish, pendingWork: job.pendingWork, schedule: job.schedule
      });
      const q = query(productsCollectionRef, where("jobOrderId", "==", job.id));
      const querySnapshot = await getDocs(q);
      setFormProducts(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } else {
      setEditingJob(null);
      setFormData(initialFormState);
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
        const docRef = await addDoc(ordersCollectionRef, { ...formData, createdBy: currentUser.username });
        savedJobId = docRef.id;
      }
      for (const product of formProducts) {
        if (!product.id && savedJobId) { 
          await addDoc(productsCollectionRef, { ...product, jobOrderId: savedJobId });
        }
      }
      fetchData(); 
      setIsJobModalOpen(false);
    } catch (error) { console.error("Error", error); }
  };

  const handleItemEntranceSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId) {
      const item = entranceList.find(i => i.id === selectedId);
      if (item) {
        setCurrentProduct({ ...currentProduct, itemEntranceId: item.id, itemName: item.itemName, modelPart: item.modelPart, serial: item.serial, po: item.po });
      }
    } else {
      setCurrentProduct({ ...currentProduct, itemEntranceId: '', itemName: '', modelPart: '', serial: '', po: '' });
    }
  };

  const handleAddProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (viewingJob) {
      const docRef = await addDoc(productsCollectionRef, { ...currentProduct, jobOrderId: viewingJob.id });
      setViewProducts([...viewProducts, { ...currentProduct, id: docRef.id, jobOrderId: viewingJob.id }]);
    } else {
      setFormProducts([...formProducts, { ...currentProduct, jobOrderId: 'pending' }]); 
    }
    setCurrentProduct({ itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '', destination: '' });
    setIsProductModalOpen(false);
  };

  const handleRemoveProductFromForm = async (index: number, product: JobProduct) => {
    if (product.id && window.confirm("Delete product?")) {
      await deleteDoc(doc(db, "jobProducts", product.id));
    }
    setFormProducts(formProducts.filter((_, i) => i !== index));
  };

  const handleRemoveProductFromDetails = async (productId: string) => {
    if(window.confirm("Delete product?")) {
      await deleteDoc(doc(db, "jobProducts", productId));
      setViewProducts(viewProducts.filter(p => p.id !== productId));
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Briefcase size={24}/> Work Activity</h2>
          <p>Manage job orders and pending repairs. Click a row to view details.</p>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}><Plus size={18}/> New Job Order</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Job Order</th><th>Destination</th><th>Description</th><th>Work Finish</th><th>Pending Work</th><th>Schedule</th></tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && <tr><td colSpan={6} className="empty-state">No records found.</td></tr>}
            {visibleOrders.map(order => (
              <tr key={order.id} className="clickable-row" onClick={() => handleViewDetails(order)}>
                <td>{order.jobOrder}</td><td>{order.destination}</td><td>{order.description}</td>
                <td><span className={order.workFinish === 'YES' ? 'badge-yes' : 'badge-no'}>{order.workFinish}</span></td>
                <td>{order.pendingWork}</td><td>{order.schedule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DETALLES */}
      {viewingJob && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>Job Order Details</h3>
              <button className="close-modal" onClick={() => setViewingJob(null)}><X size={24}/></button>
            </div>
            
            {/* SEPARACIÓN MEJORADA */}
            <div className="details-grid">
              <div className="detail-item"><span>Job Order:</span> <p>{viewingJob.jobOrder}</p></div>
              <div className="detail-item"><span>Destination:</span> <p>{viewingJob.destination}</p></div>
              <div className="detail-item"><span>Schedule:</span> <p>{viewingJob.schedule}</p></div>
              <div className="detail-item"><span>Status:</span> <p><span className={viewingJob.workFinish === 'YES' ? 'badge-yes' : 'badge-no'}>{viewingJob.workFinish}</span></p></div>
              <div className="detail-item full-width"><span>Description:</span> <p>{viewingJob.description}</p></div>
              <div className="detail-item full-width"><span>Pending Work:</span> <p>{viewingJob.pendingWork || 'None'}</p></div>
            </div>

            {/* SECCIÓN DE PRODUCTOS CON CAJA VISUAL CLARA */}
            <div className="products-section">
              <div className="products-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Associated Products / Materials</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Items attached to this specific job order.</p>
                </div>
                <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
              </div>
              <div className="table-container large-table">
                <table>
                  <thead>
                    <tr><th>Item Name</th><th>Model/Part #</th><th>Serial #</th><th>PO #</th><th>Qty</th><th>Destination</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                  </thead>
                  <tbody>
                    {viewProducts.length === 0 ? (
                      <tr><td colSpan={7} className="empty-state">No products added yet. Click "+ Add Product".</td></tr>
                    ) : (
                      viewProducts.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.itemName}</td><td>{p.modelPart}</td><td>{p.serial || '-'}</td>
                          <td>{p.po || '-'}</td><td>{p.quantity}</td><td>{p.destination || '-'}</td>
                          <td style={{ textAlign: 'center' }}><button type="button" className="btn-text-danger" onClick={() => handleRemoveProductFromDetails(p.id!)}>Remove</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="btn-container modal-footer-actions">
              <button className="action btn-danger" onClick={() => handleDelete(viewingJob.id)}><Trash2 size={18}/> Delete Order</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="action btn-secondary" onClick={() => setViewingJob(null)}>Close</button>
                <button className="action btn-primary" onClick={() => handleOpenModal(viewingJob)}><Edit2 size={18}/> Edit Order</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR */}
      {isJobModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000 }}>
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>{editingJob ? "Edit Job Order" : "Create New Job Order"}</h3>
              <button className="close-modal" onClick={() => setIsJobModalOpen(false)}><X size={24}/></button>
            </div>
            <form onSubmit={handleSaveOrder}>
              <div className="form-grid">
                <div className="form-group"><label>Job Order</label><input type="text" value={formData.jobOrder} onChange={e => setFormData({...formData, jobOrder: e.target.value})} required /></div>
                <div className="form-group"><label>Destination</label><input type="text" value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} required /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Description</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required /></div>
                <div className="form-group">
                  <label>Work Finish</label>
                  <select value={formData.workFinish} onChange={e => setFormData({...formData, workFinish: e.target.value as 'YES' | 'NO'})} required>
                    <option value="YES">YES</option><option value="NO">NO</option>
                  </select>
                </div>
                <div className="form-group"><label>Pending Work</label><input type="text" value={formData.pendingWork} onChange={e => setFormData({...formData, pendingWork: e.target.value})} /></div>
                <div className="form-group"><label>Schedule</label><input type="date" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} required /></div>
              </div>

              {/* SECCIÓN DE PRODUCTOS CON CAJA VISUAL CLARA */}
              <div className="products-section">
                <div className="products-header">
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Products / Materials List</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Items to be saved with this order.</p>
                  </div>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
                </div>
                <div className="table-container large-table">
                  <table>
                    <thead>
                      <tr><th>Item Name</th><th>Model/Part #</th><th>Qty</th><th>Destination</th><th>Status</th><th style={{ textAlign: 'center' }}>Action</th></tr>
                    </thead>
                    <tbody>
                      {formProducts.length === 0 ? (
                        <tr><td colSpan={6} className="empty-state">No products added yet. Click "+ Add Product".</td></tr>
                      ) : (
                        formProducts.map((p, index) => (
                          <tr key={index}>
                            <td style={{ fontWeight: 600 }}>{p.itemName}</td><td>{p.modelPart}</td><td>{p.quantity}</td><td>{p.destination || '-'}</td>
                            <td><span style={{ fontSize: '0.75rem', color: p.id ? 'green' : 'orange', fontWeight: 'bold' }}>{p.id ? 'Saved' : 'Pending Save'}</span></td>
                            <td style={{ textAlign: 'center' }}><button type="button" className="btn-text-danger" onClick={() => handleRemoveProductFromForm(index, p)}>Remove</button></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsJobModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary">Save Order & Data</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUB-MODAL AGREGAR PRODUCTO */}
      {isProductModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1100, backgroundColor: 'rgba(15, 23, 42, 0.8)' }}>
          <div className="modal-content" style={{ maxWidth: '650px', transform: 'translateY(0)' }}>
            <div className="modal-header">
              <h3>{viewingJob ? "Add Product directly to DB" : "Add Product to Order"}</h3>
              <button className="close-modal" onClick={() => setIsProductModalOpen(false)}><X size={24}/></button>
            </div>
            <form onSubmit={handleAddProductSubmit}>
              <div className="form-grid">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Select Item from Entrance Log</label>
                  <select value={currentProduct.itemEntranceId} onChange={handleItemEntranceSelection} required className="dropdown-select">
                    <option value="">-- Choose an item --</option>
                    {entranceList.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.itemName} (Model: {item.modelPart} | Available: {item.itemsArrived})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label>Quantity</label><input type="number" min="1" value={currentProduct.quantity} onChange={e => setCurrentProduct({...currentProduct, quantity: Number(e.target.value)})} required /></div>
                <div className="form-group"><label>Destination</label><input type="text" value={currentProduct.destination} onChange={e => setCurrentProduct({...currentProduct, destination: e.target.value})} required placeholder="Location..." /></div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}><h4 style={{ fontSize: '0.85rem', color: 'var(--primary-color)', marginTop: '10px', marginBottom: '-5px' }}>Auto-filled from Entrance Log:</h4></div>
                <div className="form-group"><label>Model / Part #</label><input type="text" value={currentProduct.modelPart} readOnly className="disabled-input" /></div>
                <div className="form-group"><label>Serial #</label><input type="text" value={currentProduct.serial} readOnly className="disabled-input" /></div>
                <div className="form-group"><label>PO #</label><input type="text" value={currentProduct.po} readOnly className="disabled-input" /></div>
                <div className="form-group"><label>Item Name (Ref)</label><input type="text" value={currentProduct.itemName} readOnly className="disabled-input" /></div>
              </div>
              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsProductModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary" disabled={!currentProduct.itemEntranceId}>
                  {viewingJob ? "Save to DB" : "Add to List"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// =========================================
// COMPONENTE PRINCIPAL (App) CON SIDEBAR
// =========================================
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<string>('workActivity'); // <- Modificado para que inicie en WorkActivity
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const handleLogin = (u: string, p: string) => setCurrentUser({ username: u, role: 'user' });
  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const handleMenuClick = (module: string) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>
      
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'open' : ''}`}>
        <div>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="logo-icon"><Briefcase size={24} /></div>
              {!isSidebarCollapsed && <span className="logo-text">App Mr Natan</span>}
            </div>
            <button className="collapse-btn desktop-only" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
              {isSidebarCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
            </button>
          </div>

          {/* Menú Actualizado: Order Entry ha sido eliminado */}
          <ul className="nav-links">
            <li className={activeModule === 'itemEntrance' ? 'active' : ''} onClick={() => handleMenuClick('itemEntrance')}>
              <PackageSearch size={20}/> <span>Item Entrance</span>
            </li>
            <li className={activeModule === 'workActivity' ? 'active' : ''} onClick={() => handleMenuClick('workActivity')}>
              <Briefcase size={20}/> <span>Work Activity</span>
            </li>
            <li className={activeModule === 'settings' ? 'active' : ''} onClick={() => handleMenuClick('settings')}>
              <Settings size={20}/> <span>Settings</span>
            </li>
          </ul>
        </div>
        
        <div className="sidebar-footer">
          <button className="action logout-btn" onClick={() => setCurrentUser(null)}>
            <LogOut size={20}/> <span>Log Out</span>
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="mobile-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <Briefcase size={24} /> <h2>App Mr Natan</h2>
          </div>
          <button className="icon-btn" style={{color: 'white'}} onClick={() => setIsMobileMenuOpen(true)}><Menu size={28}/></button>
        </div>
        
        <main className="main-content">
          {activeModule === 'itemEntrance' && <ItemEntrance />}
          {activeModule === 'workActivity' && <WorkActivity currentUser={currentUser} />}
          {activeModule === 'settings' && <SettingsModule />}
        </main>
      </div>
    </div>
  );
}