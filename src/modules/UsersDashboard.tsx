import { useState, useMemo, useCallback, type FormEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { initializeApp, getApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { db } from '../firebase';
import { Users, Plus, Trash2, User as UserIcon, Edit2, ShieldAlert } from 'lucide-react';
import type { SystemUser, UserStatus } from '../types';
import Modal from '../components/Modal';
import DataTable, { type DataColumn } from '../components/DataTable';
import ModuleHeader from '../components/ModuleHeader';
import LoadingScreen from '../components/LoadingScreen';
import { UserStatusBadge } from '../components/StatusBadge';
import { AuditLogger } from '../utils/logger';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import RequirePermission from '../components/RequirePermission';
import { useAppData } from '../hooks/useAppData';
import { formatDateDisplay, displayName, matchesSearch } from '../utils/helpers';

type ModalState = 'closed' | 'add' | 'edit' | 'detail';

export default function UsersDashboard() {
  const { currentUser } = useAuth();
  const authorName = useAuthorName();
  const { roles, users, isLoading } = useAppData();

  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalState, setModalState] = useState<ModalState>('closed');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<UserStatus>('Pending');

  const roleName = useCallback((id: string) => roles.find(r => r.id === id)?.name || 'Unknown Role', [roles]);
  const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId) ?? null, [users, selectedUserId]);

  const userColumns = useMemo<DataColumn<SystemUser>[]>(() => [
    { id: 'name', header: 'Account User', value: u => `${displayName(u, '')} ${u.email}`.trim(), hideable: false,
      render: u => (
        <div className="user-cell">
          <div className="user-avatar"><UserIcon size={18} /></div>
          <div className="flex-col">
            <span className="user-name">{u.firstName || u.lastName ? displayName(u, '') : 'No Name Set'}</span>
            <span className="user-email">{u.email}</span>
          </div>
        </div>
      ) },
    { id: 'role', header: 'Assigned Role', value: u => roleName(u.roleId), render: u => <span className="badge info">{roleName(u.roleId)}</span> },
    { id: 'status', header: 'Status', value: u => u.status, align: 'center', render: u => <UserStatusBadge status={u.status} /> },
  ], [roleName]);

  const sortedUsers = useMemo(
    () => [...users]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter(u => matchesSearch(searchTerm, u.email, u.firstName, u.lastName, roleName(u.roleId))),
    [users, searchTerm, roleName],
  );

  const handleOpenAdd = () => {
    setSelectedUserId(null);
    setFirstName(''); setLastName(''); setEmail(''); setRoleId(''); setStatus('Pending');
    setModalState('add');
  };

  const handleOpenEdit = (user: SystemUser) => {
    setSelectedUserId(user.id ?? null);
    setFirstName(user.firstName || ''); setLastName(user.lastName || ''); setEmail(user.email);
    setRoleId(user.roleId); setStatus(user.status);
    setModalState('edit');
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (modalState === 'add') {
        const normalizedEmail = email.trim().toLowerCase();
        if (users.some(u => u.email.toLowerCase() === normalizedEmail)) {
          alert('A user with this email already exists.');
          return;
        }
        // App secundaria para crear la cuenta sin cerrar la sesión del admin actual.
        const secondaryApp = initializeApp(getApp().options, `SecondaryApp_${Date.now()}`);
        try {
          const secondaryAuth = getAuth(secondaryApp);
          const tempPassword = `Temp@${Math.random().toString(36).slice(-8)}!`;
          await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, tempPassword);
          await sendPasswordResetEmail(secondaryAuth, normalizedEmail);
          await signOut(secondaryAuth);
        } finally {
          await deleteApp(secondaryApp);
        }
        const newUser: SystemUser = {
          firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail,
          roleId, status: 'Pending', createdAt: new Date().toISOString(),
        };
        const docRef = await addDoc(collection(db, 'users'), newUser);
        AuditLogger.logCreate('Account Users', authorName, docRef.id, newUser);
        alert(`Success! An invitation email has been sent to ${normalizedEmail}.`);
      } else if (modalState === 'edit' && selectedUser?.id) {
        const updatedData = { firstName: firstName.trim(), lastName: lastName.trim(), roleId, status };
        await updateDoc(doc(db, 'users', selectedUser.id), updatedData);
        AuditLogger.logUpdate('Account Users', authorName, selectedUser.id, updatedData);
      }
      setModalState('closed');
    } catch (error) {
      console.error('Error saving user:', error);
      alert(`Error processing request: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async (user: SystemUser) => {
    if (!user.id) return;
    if (user.email.toLowerCase() === currentUser?.email.toLowerCase()) { alert('You cannot revoke your own access.'); return; }
    if (!window.confirm(`Are you sure you want to revoke access for ${user.email}?`)) return;
    await deleteDoc(doc(db, 'users', user.id));
    AuditLogger.logDelete('Account Users', authorName, user.id, { email: user.email });
    if (selectedUserId === user.id) setModalState('closed');
  };

  if (isLoading) return <LoadingScreen message="Loading users..." />;

  const modalTitle = modalState === 'add' ? 'Invite New User' : modalState === 'edit' ? 'Edit User Record' : 'User Details';

  return (
    <div className="card max-1400 catalog-manager-anim">
      <ModuleHeader
        icon={<Users size={28} />}
        title="Account Users"
        subtitle="Manage system access, roles, and invitations."
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        actions={
          <RequirePermission permission="manage_users">
            <button type="button" className="action btn-primary btn-header" onClick={handleOpenAdd}><Plus size={18} /> Invite User</button>
          </RequirePermission>
        }
      />

      <DataTable<SystemUser>
        columns={userColumns}
        rows={sortedUsers}
        rowKey={u => u.id ?? u.email}
        storageKey="users"
        onRowClick={u => { setSelectedUserId(u.id ?? null); setModalState('detail'); }}
        emptyMessage="No users found."
        actions={user => (
          <RequirePermission permission="manage_users">
            <button type="button" className="icon-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEdit(user); }} title="Edit User"><Edit2 size={16} /></button>
            <button type="button" className="icon-btn delete" onClick={(e) => { e.stopPropagation(); handleDeleteUser(user); }} title="Revoke Access"><Trash2 size={16} /></button>
          </RequirePermission>
        )}
      />

      {modalState === 'detail' && selectedUser && (
        <Modal
          title={modalTitle}
          onClose={() => setModalState('closed')}
          actions={
            <RequirePermission permission="manage_users">
              <button type="button" className="action btn-primary" onClick={() => handleOpenEdit(selectedUser)}><Edit2 size={16} /> Edit</button>
            </RequirePermission>
          }
        >
          <dl className="details-grid">
            <div className="detail-item"><dt>First Name</dt><dd>{selectedUser.firstName || '-'}</dd></div>
            <div className="detail-item"><dt>Last Name</dt><dd>{selectedUser.lastName || '-'}</dd></div>
            <div className="detail-item"><dt>Email Address</dt><dd>{selectedUser.email}</dd></div>
            <div className="detail-item"><dt>Role Assigned</dt><dd>{roleName(selectedUser.roleId)}</dd></div>
            <div className="detail-item"><dt>Status</dt><dd><UserStatusBadge status={selectedUser.status} /></dd></div>
            <div className="detail-item"><dt>Registration Date</dt><dd>{formatDateDisplay(selectedUser.createdAt)}</dd></div>
          </dl>
        </Modal>
      )}

      {(modalState === 'add' || modalState === 'edit') && (
        <Modal title={modalTitle} onClose={() => setModalState('closed')} onSubmit={handleSaveUser} closeDisabled={isProcessing}>
          <div className="form-grid two-col mb-3">
            <div className="form-group">
              <label htmlFor="user-first">First Name *</label>
              <input id="user-first" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} disabled={isProcessing} placeholder="e.g. John" />
            </div>
            <div className="form-group">
              <label htmlFor="user-last">Last Name *</label>
              <input id="user-last" type="text" required value={lastName} onChange={e => setLastName(e.target.value)} disabled={isProcessing} placeholder="e.g. Doe" />
            </div>
          </div>
          <div className="form-group mb-3">
            <label htmlFor="user-email">Email Address *</label>
            <input id="user-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className={modalState === 'edit' ? 'locked' : undefined} disabled={isProcessing || modalState === 'edit'} placeholder="name@company.com" />
            {modalState === 'add'
              ? <span className="hint">A real email will be sent to establish their password.</span>
              : <span className="hint warn"><ShieldAlert size={12} /> Email cannot be changed here for security reasons.</span>}
          </div>
          <div className="form-grid two-col mb-5">
            <div className="form-group">
              <label htmlFor="user-role">Assign Role *</label>
              <select id="user-role" required value={roleId} onChange={e => setRoleId(e.target.value)} disabled={isProcessing}>
                <option value="">Select a Role...</option>
                {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            {modalState === 'edit' && (
              <div className="form-group">
                <label htmlFor="user-status">Status</label>
                <select id="user-status" required value={status} onChange={e => setStatus(e.target.value as UserStatus)} disabled={isProcessing}>
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            )}
          </div>
          <div className="form-actions">
            <button type="button" className="action btn-secondary" onClick={() => setModalState('closed')} disabled={isProcessing}>Cancel</button>
            <button type="submit" className="action btn-primary" disabled={isProcessing}>
              {isProcessing ? 'Saving...' : modalState === 'add' ? 'Send Invitation' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
