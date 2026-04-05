import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase'; 
import { ShieldCheck, Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { Role } from '../types';
import { SearchBar } from '../components/SharedUI';
import { AuditLogger } from '../utils/logger';
import { useAuth } from '../hooks/useAuth';

// Diccionario de permisos agrupados para renderizar la UI dinámicamente
const PERMISSION_GROUPS = [
  {
    module: 'Work Activity',
    permissions: [
      { id: 'view_work_activity', label: 'View Activities' },
      { id: 'add_work_activity', label: 'Add Activity' },
      { id: 'edit_work_activity', label: 'Edit Activity' },
      { id: 'delete_work_activity', label: 'Delete Activity' },
    ]
  },
  {
    module: 'Item Entrance',
    permissions: [
      { id: 'view_item_entrance', label: 'View Items' },
      { id: 'add_item_entrance', label: 'Add Item' },
      { id: 'edit_item_entrance', label: 'Edit Item' },
      { id: 'delete_item_entrance', label: 'Delete Item' },
    ]
  },
  {
    module: 'Catalogs',
    permissions: [
      { id: 'view_catalogs', label: 'View Catalogs' },
      { id: 'manage_catalogs', label: 'Add/Edit/Delete Catalogs' },
    ]
  },
  {
    module: 'System & Security',
    permissions: [
      { id: 'view_reports', label: 'View Reports' },
      { id: 'manage_security', label: 'Manage Users & Roles (Admin)' },
    ]
  }
];

export const RolesDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const fetchRoles = async () => {
    const roleData = await getDocs(collection(db, "roles"));
    const fetchedRoles = roleData.docs.map(doc => ({ id: doc.id, ...doc.data() } as Role));
    setRoles(fetchedRoles);
  };

  useEffect(() => { fetchRoles(); }, []);

  const handleOpenModal = (role: Role | null = null) => {
    if (role) {
      setEditingId(role.id);
      setRoleName(role.name);
      setSelectedPermissions(role.permissions || []);
    } else {
      setEditingId(null);
      setRoleName('');
      setSelectedPermissions([]);
    }
    setIsModalOpen(true);
  };

  const togglePermission = (permId: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const roleData = { name: roleName, permissions: selectedPermissions };
      
      if (editingId) {
        await updateDoc(doc(db, "roles", editingId), roleData);
        AuditLogger.logUpdate('Roles', currentUser?.username || 'Unknown', editingId, roleData);
      } else {
        const docRef = await addDoc(collection(db, "roles"), roleData);
        AuditLogger.logCreate('Roles', currentUser?.username || 'Unknown', docRef.id, roleData);
      }
      
      fetchRoles();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving role:", error);
      alert("Failed to save role.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the role "${name}"?`)) {
      await deleteDoc(doc(db, "roles", id));
      AuditLogger.logDelete('Roles', currentUser?.username || 'Unknown', id, { name });
      fetchRoles();
    }
  };

  const filteredRoles = roles.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="card catalog-manager-anim" style={{ maxWidth: '1200px' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={28}/> Role Management</h2>
          <p>Define roles and granular access permissions.</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '150px' }}>
          <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
            <Plus size={18}/> New Role
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Permissions Count</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 && <tr><td colSpan={3} className="empty-state">No roles found.</td></tr>}
            {filteredRoles.map(role => (
              <tr key={role.id} className="clickable-row">
                <td data-label="Role Name" style={{ fontWeight: 'bold', color: '#1e293b' }}>{role.name}</td>
                <td data-label="Permissions">
                  <span style={{ backgroundColor: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                    {role.permissions.length} rules assigned
                  </span>
                </td>
                <td data-label="Actions" style={{ textAlign: 'center' }}>
                  <div className="action-btns">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(role)}><Edit2 size={16}/></button>
                    {role.name !== 'Super Admin' && (
                       <button className="icon-btn delete" onClick={() => handleDelete(role.id, role.name)}><Trash2 size={16}/></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large" style={{ maxWidth: '800px' }}>
            <form onSubmit={handleSaveRole}>
              <div className="modal-header">
                <h3>{editingId ? "Edit Role" : "Create New Role"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" className="action btn-primary"><Save size={18} style={{marginRight: '5px'}}/> Save Role</button>
                  <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              
              <div className="form-group" style={{ marginBottom: '25px' }}>
                <label>Role Name *</label>
                <input 
                  type="text" 
                  required 
                  value={roleName} 
                  onChange={e => setRoleName(e.target.value)} 
                  placeholder="e.g., Warehouse Manager"
                  disabled={roleName === 'Super Admin'} // Proteger el super admin
                />
              </div>

              <h4 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px', color: '#334155' }}>
                Access Permissions
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {PERMISSION_GROUPS.map(group => (
                  <div key={group.module} style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <h5 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--primary-color)' }}>{group.module}</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {group.permissions.map(perm => (
                        <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'normal' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedPermissions.includes(perm.id)}
                            onChange={() => togglePermission(perm.id)}
                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                            disabled={roleName === 'Super Admin'} // Super Admin siempre tiene todo
                          />
                          {perm.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};