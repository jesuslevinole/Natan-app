import { useState, useMemo, type FormEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldCheck, Plus, Edit2, Trash2, Save } from 'lucide-react';
import type { Role } from '../types';
import Modal from '../components/Modal';
import DataTable, { type DataColumn } from '../components/DataTable';
import { PERMISSION_GROUPS } from '../utils/permissions';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { AuditLogger } from '../utils/logger';
import { useAuthorName } from '../hooks/useAuth';
import RequirePermission from '../components/RequirePermission';
import { useAppData } from '../hooks/useAppData';
import { matchesSearch } from '../utils/helpers';

const SUPER_ADMIN = 'Super Admin';

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

  const roleColumns = useMemo<DataColumn<Role>[]>(() => [
    { id: 'name', header: 'Role Name', value: r => r.name, hideable: false, render: r => <span className="cell-strong">{r.name}</span> },
    { id: 'permissions', header: 'Permissions', value: r => (r.name === SUPER_ADMIN ? 999 : r.permissions.length), type: 'number',
      render: r => <span className={`badge ${r.name === SUPER_ADMIN ? 'info' : 'neutral'}`}>{r.name === SUPER_ADMIN ? 'Full access' : `${r.permissions.length} rules assigned`}</span> },
    { id: 'users', header: 'Users', value: r => usersPerRole.get(r.id) || 0, type: 'number', align: 'center', render: r => <span className="fw-bold">{usersPerRole.get(r.id) || 0}</span> },
  ], [usersPerRole]);

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

      <DataTable<Role>
        columns={roleColumns}
        rows={filteredRoles}
        rowKey={r => r.id}
        storageKey="roles"
        onRowClick={role => handleOpenModal(role)}
        emptyMessage="No roles found."
        actions={role => (
          <RequirePermission permission="manage_roles">
            <button type="button" className="icon-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenModal(role); }} title="Edit role"><Edit2 size={16} /></button>
            {role.name !== SUPER_ADMIN && (
              <button type="button" className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(role); }} title="Delete role"><Trash2 size={16} /></button>
            )}
          </RequirePermission>
        )}
      />

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
