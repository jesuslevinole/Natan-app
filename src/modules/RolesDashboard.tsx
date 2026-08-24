import { useState, useMemo, type FormEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, Plus, Edit2, Trash2, Save } from 'lucide-react';
import type { Role } from '../types';
import Modal from '../components/Modal';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { AuditLogger } from '../utils/logger';
import { useAuthorName } from '../hooks/useAuth';
import { useAppData } from '../hooks/useAppData';
import { matchesSearch } from '../utils/helpers';

const SUPER_ADMIN = 'Super Admin';

// Diccionario de permisos agrupados para renderizar la UI dinámicamente
const PERMISSION_GROUPS = [
  { module: 'Work Activity', permissions: [
    { id: 'view_work_activity', label: 'View Activities' },
    { id: 'add_work_activity', label: 'Add Activity' },
    { id: 'edit_work_activity', label: 'Edit Activity' },
    { id: 'delete_work_activity', label: 'Delete Activity' },
  ] },
  { module: 'Item Entrance', permissions: [
    { id: 'view_item_entrance', label: 'View Items' },
    { id: 'add_item_entrance', label: 'Add Item' },
    { id: 'edit_item_entrance', label: 'Edit Item' },
    { id: 'delete_item_entrance', label: 'Delete Item' },
  ] },
  { module: 'Catalogs', permissions: [
    { id: 'view_catalogs', label: 'View Catalogs' },
    { id: 'manage_catalogs', label: 'Add/Edit/Delete/Import Catalogs' },
  ] },
  { module: 'System & Security', permissions: [
    { id: 'view_reports', label: 'View Reports' },
    { id: 'manage_security', label: 'Manage Users & Roles (Admin)' },
  ] },
];

export default function RolesDashboard() {
  const authorName = useAuthorName();
  const { roles, users, isLoading } = useAppData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const usersPerRole = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach(u => m.set(u.roleId, (m.get(u.roleId) || 0) + 1));
    return m;
  }, [users]);

  const filteredRoles = useMemo(() => roles.filter(r => matchesSearch(searchTerm, r.name)), [roles, searchTerm]);
  const isSuperAdmin = roleName === SUPER_ADMIN;

  const handleOpenModal = (role: Role | null) => {
    setEditingId(role?.id ?? null);
    setRoleName(role?.name ?? '');
    setSelectedPermissions(role?.permissions ?? []);
    setIsModalOpen(true);
  };

  const togglePermission = (permId: string) =>
    setSelectedPermissions(prev => (prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]));

  const handleSaveRole = async (e: FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      const roleData = { name: roleName.trim(), permissions: selectedPermissions };
      if (editingId) {
        await updateDoc(doc(db, 'roles', editingId), roleData);
        AuditLogger.logUpdate('Roles', authorName, editingId, roleData);
      } else {
        const docRef = await addDoc(collection(db, 'roles'), roleData);
        AuditLogger.logCreate('Roles', authorName, docRef.id, roleData);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving role:', error);
      alert('Failed to save role.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (role: Role) => {
    const inUse = usersPerRole.get(role.id) || 0;
    if (inUse > 0) { alert(`"${role.name}" is assigned to ${inUse} user(s). Reassign them before deleting the role.`); return; }
    if (!window.confirm(`Are you sure you want to delete the role "${role.name}"?`)) return;
    await deleteDoc(doc(db, 'roles', role.id));
    AuditLogger.logDelete('Roles', authorName, role.id, { name: role.name });
  };

  if (isLoading) return <LoadingScreen message="Loading roles..." />;

  return (
    <div className="card max-1200 catalog-manager-anim">
      <ModuleHeader
        icon={<ShieldCheck size={28} />}
        title="Role Management"
        subtitle="Define roles and granular access permissions."
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        actions={<button type="button" className="action btn-primary btn-header" onClick={() => handleOpenModal(null)}><Plus size={18} /> New Role</button>}
      />

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr><th>Role Name</th><th>Permissions</th><th className="text-center">Users</th><th className="text-center">Actions</th></tr>
          </thead>
          <tbody>
            {filteredRoles.length === 0 && <tr><td colSpan={4} className="empty-state">No roles found.</td></tr>}
            {filteredRoles.map(role => (
              <tr key={role.id}>
                <td data-label="Role Name" className="fw-bold text-dark">{role.name}</td>
                <td data-label="Permissions">
                  <span className="badge neutral">{role.name === SUPER_ADMIN ? 'Full access' : `${role.permissions.length} rules assigned`}</span>
                </td>
                <td data-label="Users" className="text-center">{usersPerRole.get(role.id) || 0}</td>
                <td data-label="Actions" className="cell-actions">
                  <div className="action-btns">
                    <button type="button" className="icon-btn edit" onClick={() => handleOpenModal(role)} title="Edit role"><Edit2 size={16} /></button>
                    {role.name !== SUPER_ADMIN && (
                      <button type="button" className="icon-btn delete" onClick={() => handleDelete(role)} title="Delete role"><Trash2 size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <Modal
          size="xl"
          title={editingId ? 'Edit Role' : 'Create New Role'}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSaveRole}
          closeDisabled={isProcessing}
          actions={<button type="submit" className="action btn-primary" disabled={isProcessing || isSuperAdmin}><Save size={18} /> {isProcessing ? 'Saving...' : 'Save Role'}</button>}
        >
          <div className="form-group mb-5">
            <label htmlFor="role-name">Role Name *</label>
            <input id="role-name" type="text" required value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="e.g., Warehouse Manager" disabled={isSuperAdmin} />
            {isSuperAdmin && <span className="hint warn">The Super Admin role always has every permission and cannot be edited.</span>}
          </div>

          <h4 className="subheading">Access Permissions</h4>
          <div className="group-grid">
            {PERMISSION_GROUPS.map(group => (
              <fieldset key={group.module} className="group-box">
                <h5>{group.module}</h5>
                <div className="flex-col checkbox-list">
                  {group.permissions.map(perm => (
                    <label key={perm.id} className="checkbox-label">
                      <input type="checkbox" className="checkbox-lg" checked={isSuperAdmin || selectedPermissions.includes(perm.id)} onChange={() => togglePermission(perm.id)} disabled={isSuperAdmin} />
                      {perm.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
