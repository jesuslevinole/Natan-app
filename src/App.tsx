import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from './firebase'; 
import './App.css';

// =========================================
// INTERFACES Y TIPOS
// =========================================
interface User {
  username: string;
  role: 'admin' | 'user';
}

interface JobOrder {
  id: string;
  jobOrder: string;
  destination: string;
  description: string;
  workFinish: 'YES' | 'NO';
  pendingWork: string;
  schedule: string;
  createdBy: string;
}

interface JobProduct {
  id?: string; 
  jobOrderId: string; 
  inventoryId: string; // Relación con la tabla de inventario
  modelPart: string;
  serial: string;
  po: string;
  quantity: number;
  itemName: string;
  destination: string;
}

// NUEVA INTERFAZ: INVENTARIO
interface InventoryItem {
  id: string;
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

type JobFormData = Omit<JobOrder, 'id' | 'createdBy'>;
type ProductFormData = Omit<JobProduct, 'id' | 'jobOrderId'>;
type InventoryFormData = Omit<InventoryItem, 'id'>;

// =========================================
// COMPONENTE 1: PANTALLA DE AUTENTICACIÓN
// =========================================
interface AuthScreenProps {
  onLogin: (username: string, password: string) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLogin) {
      onLogin(username, password);
    } else {
      alert("Registration submitted successfully!\n\nWait for Admin approval.");
      setIsLogin(true);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2>App Mr Natan</h2>
        <p className="subtitle">{isLogin ? "Test Mode: Any credentials work." : "Create a new account"}</p>
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group" style={{ marginBottom: '15px' }}>
              <label>Full Name</label>
              <input type="text" placeholder="John Doe" required />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: '15px' }}>
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="auth-btn">{isLogin ? 'Log In' : 'Sign Up'}</button>
        </form>
        <p className="toggle-auth" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </p>
      </div>
    </div>
  );
};

// =========================================
// COMPONENTE 2: MÓDULO DE INVENTARIO (NUEVO)
// =========================================
const InventoryLog: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialForm: InventoryFormData = {
    date: '', modelPart: '', serial: '', po: '', orderDate: '', 
    quantityOrdered: 0, itemsArrived: 0, supplyCompany: '', itemName: ''
  };
  const [formData, setFormData] = useState<InventoryFormData>(initialForm);

  const collectionRef = collection(db, "inventory");

  const fetchInventory = async () => {
    const data = await getDocs(collectionRef);
    setInventory(data.docs.map(doc => ({ ...doc.data(), id: doc.id })) as InventoryItem[]);
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleOpenModal = (item: InventoryItem | null = null) => {
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
    if (window.confirm("⚠️ Delete this item?")) {
      await deleteDoc(doc(db, "inventory", id));
      fetchInventory();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await updateDoc(doc(db, "inventory", editingId), { ...formData });
    } else {
      await addDoc(collectionRef, formData);
    }
    fetchInventory();
    setIsModalOpen(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2>Inventory Log</h2>
          <p>Register and manage incoming products and materials.</p>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}>+ New Item</button>
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
            {inventory.length === 0 && <tr><td colSpan={10} className="empty-state">No inventory items.</td></tr>}
            {inventory.map(item => (
              <tr key={item.id}>
                <td>{item.date}</td><td>{item.modelPart}</td><td>{item.serial}</td><td>{item.po}</td>
                <td>{item.orderDate}</td><td>{item.quantityOrdered}</td><td>{item.itemsArrived}</td>
                <td>{item.supplyCompany}</td><td style={{fontWeight: 'bold'}}>{item.itemName}</td>
                <td>
                  <div className="action-btns">
                    <button className="btn-text-primary" onClick={() => handleOpenModal(item)}>Edit</button>
                    <button className="btn-text-danger" onClick={() => handleDelete(item.id)}>Delete</button>
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
              <h3>{editingId ? "Edit Item" : "Add New Item to Inventory"}</h3>
              <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}>&times;</button>
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
                <button type="submit" className="action btn-primary">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================
// COMPONENTE 3: MÓDULO DE TRABAJO (ACTUALIZADO)
// =========================================
interface WorkActivityProps {
  currentUser: User;
}

const WorkActivity: React.FC<WorkActivityProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]); // NUEVO: Estado para lista de inventario
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
    inventoryId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '', destination: ''
  });

  const ordersCollectionRef = collection(db, "jobOrders");
  const productsCollectionRef = collection(db, "jobProducts");
  const inventoryCollectionRef = collection(db, "inventory"); // Referencia a la tabla Inventory

  const fetchData = async () => {
    try {
      // Traer Ordenes
      const orderData = await getDocs(ordersCollectionRef);
      setOrders(orderData.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as JobOrder[]);
      // Traer Inventario (para el Dropdown)
      const invData = await getDocs(inventoryCollectionRef);
      setInventoryList(invData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as InventoryItem[]);
    } catch (error) {
      console.error("Error fetching documents: ", error);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const visibleOrders = currentUser.role === 'admin' 
    ? orders 
    : orders.filter(o => o.createdBy === currentUser.username);

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
          // AQUI PODRÍAS AÑADIR LÓGICA PARA RESTAR LA CANTIDAD DEL INVENTARIO ORIGINAL
        }
      }
      fetchData(); 
      setIsJobModalOpen(false);
    } catch (error) { console.error("Error", error); }
  };

  // MANEJO DE SELECCIÓN DE PRODUCTO DEL DROPDOWN
  const handleInventorySelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedInvId = e.target.value;
    if (selectedInvId) {
      const item = inventoryList.find(i => i.id === selectedInvId);
      if (item) {
        setCurrentProduct({
          ...currentProduct,
          inventoryId: item.id,
          itemName: item.itemName,
          modelPart: item.modelPart,
          serial: item.serial,
          po: item.po
        });
      }
    } else {
      // Resetear si seleccionan la opción vacía
      setCurrentProduct({
        ...currentProduct, inventoryId: '', itemName: '', modelPart: '', serial: '', po: ''
      });
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
    setCurrentProduct({ inventoryId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '', destination: '' });
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
          <h2>Work Activity</h2>
          <p>Manage job orders and pending repairs. Click a row to view details.</p>
        </div>
        <button className="action btn-primary" onClick={() => handleOpenModal(null)}>+ New Job Order</button>
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

      {/* MODAL: VER DETALLES */}
      {viewingJob && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>Job Order Details</h3>
              <button type="button" className="close-modal" onClick={() => setViewingJob(null)}>&times;</button>
            </div>
            <div className="details-grid">
              <div className="detail-item"><span>Job Order:</span> <p>{viewingJob.jobOrder}</p></div>
              <div className="detail-item"><span>Destination:</span> <p>{viewingJob.destination}</p></div>
              <div className="detail-item"><span>Schedule:</span> <p>{viewingJob.schedule}</p></div>
              <div className="detail-item"><span>Status:</span> <p><span className={viewingJob.workFinish === 'YES' ? 'badge-yes' : 'badge-no'}>{viewingJob.workFinish}</span></p></div>
              <div className="detail-item full-width"><span>Description:</span> <p>{viewingJob.description}</p></div>
              <div className="detail-item full-width"><span>Pending Work:</span> <p>{viewingJob.pendingWork || 'None'}</p></div>
            </div>

            <div className="products-section">
              <div className="products-header">
                <h4>Associated Products / Materials</h4>
                <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}>+ Add Product</button>
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
              <button type="button" className="action btn-danger" onClick={() => handleDelete(viewingJob.id)}>Delete Order</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" className="action btn-secondary" onClick={() => setViewingJob(null)}>Close</button>
                <button type="button" className="action btn-primary" onClick={() => handleOpenModal(viewingJob)}>Edit Order</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREAR/EDITAR JOB ORDER */}
      {isJobModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000 }}>
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>{editingJob ? "Edit Job Order" : "Create New Job Order"}</h3>
              <button type="button" className="close-modal" onClick={() => setIsJobModalOpen(false)}>&times;</button>
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

              <div className="products-section">
                <div className="products-header">
                  <h4>Products / Materials List</h4>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}>+ Add Product</button>
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

      {/* SUB-MODAL: AÑADIR PRODUCTO (Con DROPDOWN e Inputs de Solo Lectura) */}
      {isProductModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1100, backgroundColor: 'rgba(15, 23, 42, 0.8)' }}>
          <div className="modal-content" style={{ maxWidth: '650px', transform: 'translateY(0)' }}>
            <div className="modal-header">
              <h3>{viewingJob ? "Add Product directly to DB" : "Add Product to Order"}</h3>
              <button type="button" className="close-modal" onClick={() => setIsProductModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddProductSubmit}>
              <div className="form-grid">
                
                {/* SELECTOR DESPLEGABLE DESDE INVENTARIO */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Select Item from Inventory</label>
                  <select 
                    value={currentProduct.inventoryId} 
                    onChange={handleInventorySelection} 
                    required 
                    className="dropdown-select"
                  >
                    <option value="">-- Choose an item --</option>
                    {inventoryList.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.itemName} (Model: {item.modelPart} | Available: {item.itemsArrived})
                      </option>
                    ))}
                  </select>
                </div>

                {/* CAMPOS DE CANTIDAD Y DESTINO (Editables) */}
                <div className="form-group"><label>Quantity</label><input type="number" min="1" value={currentProduct.quantity} onChange={e => setCurrentProduct({...currentProduct, quantity: Number(e.target.value)})} required /></div>
                <div className="form-group"><label>Destination</label><input type="text" value={currentProduct.destination} onChange={e => setCurrentProduct({...currentProduct, destination: e.target.value})} required placeholder="Location..." /></div>

                {/* CAMPOS BLOQUEADOS (Vienen de la DB) */}
                <div className="form-group" style={{ gridColumn: 'span 2' }}><h4 style={{ fontSize: '0.85rem', color: 'var(--primary-color)', marginTop: '10px', marginBottom: '-5px' }}>Auto-filled from Inventory:</h4></div>
                
                <div className="form-group">
                  <label>Model / Part #</label>
                  <input type="text" value={currentProduct.modelPart} readOnly className="disabled-input" />
                </div>
                <div className="form-group">
                  <label>Serial #</label>
                  <input type="text" value={currentProduct.serial} readOnly className="disabled-input" />
                </div>
                <div className="form-group">
                  <label>PO #</label>
                  <input type="text" value={currentProduct.po} readOnly className="disabled-input" />
                </div>
                <div className="form-group">
                  <label>Item Name (Ref)</label>
                  <input type="text" value={currentProduct.itemName} readOnly className="disabled-input" />
                </div>
              </div>
              
              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsProductModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary" disabled={!currentProduct.inventoryId}>
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
// COMPONENTE PRINCIPAL (App)
// =========================================
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<string>('workActivity');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const handleLogin = (username: string, password: string) => {
    if (username.toLowerCase() === 'admin' && password.toLowerCase() === 'admin') {
      setCurrentUser({ username: 'admin', role: 'admin' });
    } else {
      setCurrentUser({ username, role: 'user' });
    }
  };

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

  const handleMenuClick = (module: string) => {
    setActiveModule(module);
    setIsSidebarOpen(false);
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div>
          <div className="sidebar-header">App Mr Natan</div>
          <ul className="nav-links">
            <li className={activeModule === 'orderEntry' ? 'active' : ''} onClick={() => handleMenuClick('orderEntry')}>Order Entry</li>
            <li className={activeModule === 'workActivity' ? 'active' : ''} onClick={() => handleMenuClick('workActivity')}>Work Activity</li>
            {/* INVENTORY AHORA ESTÁ ACTIVO */}
            <li className={activeModule === 'inventory' ? 'active' : ''} onClick={() => handleMenuClick('inventory')}>Inventory Log</li>
          </ul>
        </div>
        <div className="sidebar-footer">
          <button className="action logout-btn" onClick={() => setCurrentUser(null)}>Log Out</button>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="mobile-header">
          <h2>App Mr Natan</h2>
          <button onClick={() => setIsSidebarOpen(true)}>☰</button>
        </div>
        <main className="main-content">
          {activeModule === 'orderEntry' && <div className="card"><h2>Order Entry</h2><p>Under construction...</p></div>}
          {activeModule === 'inventory' && <InventoryLog />}
          {activeModule === 'workActivity' && <WorkActivity currentUser={currentUser} />}
        </main>
      </div>
    </div>
  );
}