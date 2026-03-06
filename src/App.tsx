import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase'; // Asegúrate de que la ruta coincida con donde creaste el archivo firebase.ts
import './App.css';

// =========================================
// INTERFACES Y TIPOS
// =========================================
interface User {
  username: string;
  role: 'admin' | 'user';
}

interface JobOrder {
  id: string; // FUE CAMBIADO A STRING PARA SOPORTAR FIREBASE
  jobOrder: string;
  destination: string;
  description: string;
  workFinish: 'YES' | 'NO';
  pendingWork: string;
  schedule: string;
  createdBy: string;
}

type JobFormData = Omit<JobOrder, 'id' | 'createdBy'>;

// =========================================
// COMPONENTE 1: PANTALLA DE AUTENTICACIÓN (Mockup)
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
// COMPONENTE 2: MÓDULO DE TRABAJO (CRUD FIREBASE)
// =========================================
interface WorkActivityProps {
  currentUser: User;
}

const WorkActivity: React.FC<WorkActivityProps> = ({ currentUser }) => {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [editingJob, setEditingJob] = useState<string | null>(null); // Cambiado a string

  const initialFormState: JobFormData = {
    jobOrder: '', destination: '', description: '', workFinish: 'NO', pendingWork: '', schedule: ''
  };
  const [formData, setFormData] = useState<JobFormData>(initialFormState);

  // REFERENCIA A LA COLECCIÓN EN FIREBASE
  const ordersCollectionRef = collection(db, "jobOrders");

  // LEER DATOS (READ)
  const fetchOrders = async () => {
    try {
      const data = await getDocs(ordersCollectionRef);
      const fetchedOrders = data.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id // Firestore usa doc.id como identificador único
      })) as JobOrder[];
      setOrders(fetchedOrders);
    } catch (error) {
      console.error("Error fetching documents: ", error);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const visibleOrders = currentUser.role === 'admin' 
    ? orders 
    : orders.filter(o => o.createdBy === currentUser.username);

  const handleOpenModal = (job: JobOrder | null = null) => {
    if (job) {
      setEditingJob(job.id);
      setFormData({
        jobOrder: job.jobOrder, destination: job.destination, description: job.description, 
        workFinish: job.workFinish, pendingWork: job.pendingWork, schedule: job.schedule
      });
    } else {
      setEditingJob(null);
      setFormData(initialFormState);
    }
    setIsJobModalOpen(true);
  };

  // ELIMINAR DATOS (DELETE)
  const handleDelete = async (id: string) => {
    if (window.confirm("⚠️ Are you sure you want to permanently delete this record?")) {
      try {
        const jobDoc = doc(db, "jobOrders", id);
        await deleteDoc(jobDoc);
        fetchOrders(); // Recargar la lista
      } catch (error) {
        console.error("Error deleting document: ", error);
      }
    }
  };

  // CREAR Y ACTUALIZAR DATOS (CREATE / UPDATE)
  const handleSaveOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (editingJob) {
        // Actualizar registro existente
        const jobDoc = doc(db, "jobOrders", editingJob);
        await updateDoc(jobDoc, { ...formData });
      } else {
        // Crear nuevo registro
        await addDoc(ordersCollectionRef, { 
          ...formData, 
          createdBy: currentUser.username 
        });
      }
      fetchOrders(); // Recargar la lista desde Firebase
      setIsJobModalOpen(false);
    } catch (error) {
      console.error("Error saving document: ", error);
    }
  };

  const handleExport = (format: 'Excel' | 'PDF') => {
    alert(`Generating ${format} report...\n(This is a test simulation)`);
    setIsExportModalOpen(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-text">
          <h2>Work Activity</h2>
          <p>Manage job orders and pending repairs.</p>
        </div>
        <div className="header-actions">
          <button className="action btn-secondary" onClick={() => setIsExportModalOpen(true)}>Export Data</button>
          <button className="action btn-primary" onClick={() => handleOpenModal(null)}>+ New Job Order</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Job Order</th><th>Destination</th><th>Description</th>
              <th>Work Finish</th><th>Pending Work</th><th>Schedule</th><th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>No records found.</td></tr>
            )}
            {visibleOrders.map(order => (
              <tr key={order.id}>
                <td>{order.jobOrder}</td><td>{order.destination}</td><td>{order.description}</td>
                <td><span className={order.workFinish === 'YES' ? 'badge-yes' : 'badge-no'}>{order.workFinish}</span></td>
                <td>{order.pendingWork}</td><td>{order.schedule}</td>
                <td>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(order)}>✏️</button>
                    <button className="icon-btn delete" onClick={() => handleDelete(order.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Job Order */}
      {isJobModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content">
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
              <div className="btn-container">
                <button type="button" className="action btn-secondary" onClick={() => setIsJobModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary">Save Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Export (Queda igual) */}
      {isExportModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            {/* Contenido del modal de exportación... */}
            <div className="modal-header">
              <h3>Export Data</h3>
              <button type="button" className="close-modal" onClick={() => setIsExportModalOpen(false)}>&times;</button>
            </div>
            <div className="form-grid">
              <div className="form-group"><label>Start Date</label><input type="date" required /></div>
              <div className="form-group"><label>End Date</label><input type="date" required /></div>
            </div>
            <div className="btn-container" style={{ justifyContent: 'space-between', marginTop: '30px' }}>
              <button type="button" className="action btn-excel" onClick={() => handleExport('Excel')}>Download Excel</button>
              <button type="button" className="action btn-pdf" onClick={() => handleExport('PDF')}>Download PDF</button>
            </div>
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

  // NOTA: Este es un login falso. Se puede conectar con Firebase Auth luego.
  const handleLogin = (username: string, password: string) => {
    if (username.toLowerCase() === 'admin' && password.toLowerCase() === 'admin') {
      setCurrentUser({ username: 'admin', role: 'admin' });
    } else {
      setCurrentUser({ username, role: 'user' });
    }
  };

  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} />;
  }

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
          {activeModule === 'inventory' && <div className="card"><h2>Inventory Log</h2><p>Under construction...</p></div>}
          {activeModule === 'workActivity' && <WorkActivity currentUser={currentUser} />}
        </main>
      </div>
    </div>
  );
}