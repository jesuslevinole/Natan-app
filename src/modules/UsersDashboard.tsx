import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
// 🔥 SOLUCIÓN: Importamos 'getApp' para no depender de la exportación de tu firebase.ts
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { db } from '../firebase'; // 🔥 Importación limpia sin 'app'
import { Users, Plus, Trash2, X } from 'lucide-react';
import { SearchBar } from '../components/SharedUI';
import { Role, SystemUser } from '../types';
import { AuditLogger } from '../utils/logger';
import { useAuth } from '../hooks/useAuth';

export const UsersDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);

  const fetchData = async () => {
    try {
      const rolesSnap = await getDocs(collection(db, 'roles'));
      const fetchedRoles = rolesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
      setAvailableRoles(fetchedRoles);

      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemUser));
      
      fetchedUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSystemUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users or roles:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    try {
      // 🔥 OBTENEMOS LA APP NATIVA DE MEMORIA PARA EVITAR EL ERROR DE IMPORTACIÓN
      const mainApp = getApp();
      
      // Creamos la instancia secundaria usando las opciones de la app principal
      const secondaryAppName = `SecondaryApp_${Date.now()}`;
      const secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      // Creamos la cuenta con una contraseña temporal super segura
      const tempPassword = `Temp@${Math.random().toString(36).slice(-8)}!`;
      await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, tempPassword);

      // Disparamos el correo real de Firebase para restablecer contraseña
      await sendPasswordResetEmail(secondaryAuth, newUserEmail);

      // Limpiamos y cerramos la instancia secundaria
      await signOut(secondaryAuth);

      // Guardamos en Firestore el registro del usuario
      const newUser: SystemUser = {
        email: newUserEmail,
        roleId: newUserRole,
        status: 'Pending', 
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'users'), newUser);
      
      // Registro en Auditoría
      AuditLogger.logCreate('Account Users', currentUser?.username || 'System', docRef.id, newUser);

      alert(`Success! An invitation email has been sent to ${newUserEmail}.`);
      setIsModalOpen(false);
      setNewUserEmail('');
      setNewUserRole('');
      fetchData();
      
    } catch (error: any) {
      console.error("Error adding user:", error);
      alert(`Error sending invitation: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (window.confirm(`Are you sure you want to revoke access for ${email}?`)) {
      await deleteDoc(doc(db, "users", id));
      AuditLogger.logDelete('Account Users', currentUser?.username || 'System', id, { email });
      fetchData();
    }
  };

  const filteredUsers = systemUsers.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="card catalog-manager-anim" style={{ maxWidth: '1400px' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={28}/> Account Users</h2>
          <p>Manage system access, roles, and invitations.</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '150px' }}>
          <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => setIsModalOpen(true)}>
            <Plus size={18}/> Invite User
          </button>
        </div>
      </div>
      
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>User Email</th>
              <th>Assigned Role</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && <tr><td colSpan={4} className="empty-state">No users invited yet. Click "Invite User".</td></tr>}
            {filteredUsers.map(user => {
              const roleName = availableRoles.find(r => r.id === user.roleId)?.name || 'Unknown Role';
              
              return (
                <tr key={user.id} className="clickable-row">
                  <td data-label="User Email" style={{ fontWeight: 'bold' }}>{user.email}</td>
                  <td data-label="Role" style={{ color: '#475569' }}>{roleName}</td>
                  <td data-label="Status" style={{ textAlign: 'center' }}>
                    <span style={{ 
                      backgroundColor: user.status === 'Pending' ? '#fef08a' : '#d1fae5', 
                      color: user.status === 'Pending' ? '#ea580c' : '#16a34a', 
                      padding: '4px 12px', 
                      borderRadius: '12px', 
                      fontWeight: 'bold',
                      fontSize: '0.8rem'
                    }}>
                      {user.status}
                    </span>
                  </td>
                  <td data-label="Action" style={{ textAlign: 'center' }}>
                    <div className="action-btns">
                      <button className="icon-btn delete" onClick={() => handleDeleteUser(user.id!, user.email)} title="Revoke Access">
                        <Trash2 size={16}/>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <form onSubmit={handleRegisterUser}>
              <div className="modal-header">
                <h3>Invite New User</h3>
                <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)} disabled={isProcessing}><X size={24}/></button>
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Email Address *</label>
                <input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} disabled={isProcessing} />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                  A real email will be sent to establish their password.
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: '25px' }}>
                <label>Assign Role *</label>
                <select required value={newUserRole} onChange={e => setNewUserRole(e.target.value)} disabled={isProcessing}>
                  <option value="">Select a Role...</option>
                  {availableRoles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="action btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isProcessing}>Cancel</button>
                <button type="submit" className="action btn-primary" disabled={isProcessing}>
                  {isProcessing ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};