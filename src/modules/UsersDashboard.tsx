import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { db } from '../firebase'; 
import { Users, Plus, Trash2, X, User as UserIcon, Edit2, ShieldAlert } from 'lucide-react';
import { SearchBar } from '../components/SharedUI';
import { Role, SystemUser } from '../types';
import { AuditLogger } from '../utils/logger';
import { useAuth, RequirePermission } from '../hooks/useAuth';
import { formatDateDisplay } from '../utils/helpers';

export const UsersDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); 
  
  // 🔥 Máquina de estados para el Modal (Crear, Editar, Ver Detalle)
  const [modalState, setModalState] = useState<'closed' | 'add' | 'edit' | 'detail'>('closed');
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  
  // Estados del Formulario Unificado
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<'Pending' | 'Active' | string>('Pending');
  
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

  // Controladores de apertura de Modales
  const handleOpenAdd = () => {
    setSelectedUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setRoleId('');
    setStatus('Pending');
    setModalState('add');
  };

  const handleOpenEdit = (user: SystemUser) => {
    setSelectedUser(user);
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email);
    setRoleId(user.roleId);
    setStatus(user.status);
    setModalState('edit');
  };

  const handleOpenDetail = (user: SystemUser) => {
    setSelectedUser(user);
    setModalState('detail');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    
    try {
      if (modalState === 'add') {
        // 🔥 LÓGICA DE CREACIÓN (Con invitación por correo)
        const mainApp = getApp();
        const secondaryAppName = `SecondaryApp_${Date.now()}`;
        const secondaryApp = initializeApp(mainApp.options, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);

        const tempPassword = `Temp@${Math.random().toString(36).slice(-8)}!`;
        await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
        await sendPasswordResetEmail(secondaryAuth, email);
        await signOut(secondaryAuth);

        const newUser: SystemUser = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          roleId: roleId,
          status: 'Pending', 
          createdAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, 'users'), newUser);
        AuditLogger.logCreate('Account Users', currentUser?.username || 'System', docRef.id, newUser);
        alert(`Success! An invitation email has been sent to ${email}.`);

      } else if (modalState === 'edit' && selectedUser?.id) {
        // 🔥 LÓGICA DE EDICIÓN (Actualización simple en Firestore)
        const updatedData = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          roleId: roleId,
          status: status
          // El email no se edita aquí por seguridad de Firebase Auth
        };

        await updateDoc(doc(db, 'users', selectedUser.id), updatedData);
        AuditLogger.logUpdate('Account Users', currentUser?.username || 'System', selectedUser.id, updatedData);
      }

      setModalState('closed');
      fetchData();
      
    } catch (error: any) {
      console.error("Error saving user:", error);
      alert(`Error processing request: ${error.message}`);
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
    (u.firstName && u.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.lastName && u.lastName.toLowerCase().includes(searchTerm.toLowerCase()))
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
          <RequirePermission permission="manage_security">
            <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={handleOpenAdd}>
              <Plus size={18}/> Invite User
            </button>
          </RequirePermission>
        </div>
      </div>
      
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              {/* 🔥 COLUMNA DE ACCIÓN REUBICADA AL PRINCIPIO */}
              <th style={{ textAlign: 'center', width: '80px' }}>Action</th>
              <th>Account User</th>
              <th>Assigned Role</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 && <tr><td colSpan={4} className="empty-state">No users found.</td></tr>}
            {filteredUsers.map(user => {
              const roleName = availableRoles.find(r => r.id === user.roleId)?.name || 'Unknown Role';
              // Manejo de registros antiguos que no tengan nombre
              const displayName = user.firstName || user.lastName 
                ? `${user.firstName || ''} ${user.lastName || ''}`.trim() 
                : 'No Name Set';
              
              return (
                <tr key={user.id} className="clickable-row" onClick={() => handleOpenDetail(user)}>
                  {/* 🔥 BOTONES DE ACCIÓN CON e.stopPropagation() PARA NO ABRIR EL DETALLE */}
                  <td data-label="Action" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                    <div className="action-btns" style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <RequirePermission permission="manage_security">
                        <button 
                          type="button"
                          className="icon-btn edit" 
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(user); }} 
                          title="Edit User"
                        >
                          <Edit2 size={16}/>
                        </button>
                        <button 
                          type="button"
                          className="icon-btn delete" 
                          onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.id!, user.email); }} 
                          title="Revoke Access"
                        >
                          <Trash2 size={16}/>
                        </button>
                      </RequirePermission>
                    </div>
                  </td>
                  
                  <td data-label="User">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '50%', color: '#64748b' }}>
                        <UserIcon size={18} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>
                          {displayName}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{user.email}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role" style={{ color: '#475569', verticalAlign: 'middle' }}>
                    {roleName}
                  </td>
                  <td data-label="Status" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 🔥 MODAL MULTIPROPÓSITO: ADD, EDIT, DETAIL */}
      {modalState !== 'closed' && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            
            <div className="modal-header">
              <h3>
                {modalState === 'add' ? 'Invite New User' : 
                 modalState === 'edit' ? 'Edit User Record' : 'User Details'}
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                {modalState === 'detail' && (
                   <RequirePermission permission="manage_security">
                     <button className="action btn-primary" onClick={() => handleOpenEdit(selectedUser!)}><Edit2 size={16}/> Edit</button>
                   </RequirePermission>
                )}
                <button type="button" className="close-modal" onClick={() => setModalState('closed')} disabled={isProcessing}><X size={24}/></button>
              </div>
            </div>

            {modalState === 'detail' && selectedUser ? (
              // VISTA DE DETALLES
              <div className="details-grid">
                <div className="detail-item"><span>First Name:</span> <p>{selectedUser.firstName || '-'}</p></div>
                <div className="detail-item"><span>Last Name:</span> <p>{selectedUser.lastName || '-'}</p></div>
                <div className="detail-item"><span>Email Address:</span> <p>{selectedUser.email}</p></div>
                <div className="detail-item"><span>Role Assigned:</span> <p>{availableRoles.find(r => r.id === selectedUser.roleId)?.name || 'Unknown'}</p></div>
                <div className="detail-item">
                  <span>Status:</span> 
                  <p style={{ color: selectedUser.status === 'Pending' ? '#ea580c' : '#16a34a', fontWeight: 'bold' }}>
                    {selectedUser.status}
                  </p>
                </div>
                <div className="detail-item"><span>Registration Date:</span> <p>{formatDateDisplay(selectedUser.createdAt)}</p></div>
              </div>
            ) : (
              // FORMULARIO (ADD & EDIT)
              <form onSubmit={handleSaveUser}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                  <div className="form-group">
                    <label>First Name *</label>
                    <input 
                      type="text" required 
                      value={firstName} onChange={e => setFirstName(e.target.value)} 
                      disabled={isProcessing} placeholder="e.g. John"
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input 
                      type="text" required 
                      value={lastName} onChange={e => setLastName(e.target.value)} 
                      disabled={isProcessing} placeholder="e.g. Doe"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label>Email Address *</label>
                  <input 
                    type="email" required 
                    value={email} onChange={e => setEmail(e.target.value)} 
                    disabled={isProcessing || modalState === 'edit'} // Bloqueado en edición
                    placeholder="name@company.com"
                    style={{ backgroundColor: modalState === 'edit' ? '#f1f5f9' : 'white' }}
                  />
                  {modalState === 'add' ? (
                     <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                       A real email will be sent to establish their password.
                     </span>
                  ) : (
                     <span style={{ fontSize: '0.75rem', color: '#ea580c', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                       <ShieldAlert size={12}/> Email cannot be changed here for security reasons.
                     </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                  <div className="form-group">
                    <label>Assign Role *</label>
                    <select required value={roleId} onChange={e => setRoleId(e.target.value)} disabled={isProcessing}>
                      <option value="">Select a Role...</option>
                      {availableRoles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  {modalState === 'edit' && (
                    <div className="form-group">
                      <label>Status</label>
                      <select required value={status} onChange={e => setStatus(e.target.value)} disabled={isProcessing}>
                        <option value="Pending">Pending</option>
                        <option value="Active">Active</option>
                        <option value="Suspended">Suspended</option>
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                  <button type="button" className="action btn-secondary" onClick={() => setModalState('closed')} disabled={isProcessing}>Cancel</button>
                  <button type="submit" className="action btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : modalState === 'add' ? 'Send Invitation' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};