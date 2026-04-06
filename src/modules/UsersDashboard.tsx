import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { db } from '../firebase'; 
import { Users, Plus, Trash2, X, User as UserIcon } from 'lucide-react';
import { SearchBar } from '../components/SharedUI';
import { Role, SystemUser } from '../types';
import { AuditLogger } from '../utils/logger';
import { useAuth } from '../hooks/useAuth';

export const UsersDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  
  // 🔥 NUEVOS ESTADOS DE FORMULARIO
  const [newUserFirstName, setNewUserFirstName] = useState('');
  const [newUserLastName, setNewUserLastName] = useState('');
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
      // 1. Obtener la App Principal de Firebase
      const mainApp = getApp();
      
      // 2. Instancia Secundaria para Auth Segura
      const secondaryAppName = `SecondaryApp_${Date.now()}`;
      const secondaryApp = initializeApp(mainApp.options, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      // 3. Crear usuario con contraseña temporal
      const tempPassword = `Temp@${Math.random().toString(36).slice(-8)}!`;
      await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, tempPassword);

      // 4. Enviar correo de restablecimiento (Invitación real)
      await sendPasswordResetEmail(secondaryAuth, newUserEmail);

      // 5. Cerrar sesión secundaria para no afectar al admin
      await signOut(secondaryAuth);

      // 6. Guardar el registro completo en Firestore
      const newUser: SystemUser = {
        firstName: newUserFirstName.trim(),
        lastName: newUserLastName.trim(),
        email: newUserEmail.trim(),
        roleId: newUserRole,
        status: 'Pending', 
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'users'), newUser);
      
      // 7. Registro de Auditoría
      AuditLogger.logCreate('Account Users', currentUser?.username || 'System', docRef.id, newUser);

      alert(`Success! An invitation email has been sent to ${newUserEmail}.`);
      setIsModalOpen(false);
      
      // Limpieza de Estados
      setNewUserFirstName('');
      setNewUserLastName('');
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
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.lastName.toLowerCase().includes(searchTerm.toLowerCase())
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
              <th>Account User</th>
              <th>Assigned Role</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && <tr><td colSpan={4} className="empty-state">No users found.</td></tr>}
            {filteredUsers.map(user => {
              const roleName = availableRoles.find(r => r.id === user.roleId)?.name || 'Unknown Role';
              
              return (
                <tr key={user.id} className="clickable-row">
                  {/* 🔥 UI MEJORADA: Mostramos Nombre Completo con Correo abajo */}
                  <td data-label="User">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '50%', color: '#64748b' }}>
                        <UserIcon size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{user.firstName} {user.lastName}</span>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.email}</span>
                      </div>
                    </div>
                  </td>
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
          {/* Aumenté ligeramente el max-width para acomodar las columnas */}
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <form onSubmit={handleRegisterUser}>
              <div className="modal-header">
                <h3>Invite New User</h3>
                <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)} disabled={isProcessing}><X size={24}/></button>
              </div>

              {/* 🔥 CSS GRID ADAPTATIVO: Nombres uno al lado del otro en PC, apilados en móvil */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group">
                  <label>First Name *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUserFirstName} 
                    onChange={e => setNewUserFirstName(e.target.value)} 
                    disabled={isProcessing} 
                    placeholder="e.g. John"
                  />
                </div>
                <div className="form-group">
                  <label>Last Name *</label>
                  <input 
                    type="text" 
                    required 
                    value={newUserLastName} 
                    onChange={e => setNewUserLastName(e.target.value)} 
                    disabled={isProcessing} 
                    placeholder="e.g. Doe"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Email Address *</label>
                <input 
                  type="email" 
                  required 
                  value={newUserEmail} 
                  onChange={e => setNewUserEmail(e.target.value)} 
                  disabled={isProcessing} 
                  placeholder="name@company.com"
                />
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

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
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