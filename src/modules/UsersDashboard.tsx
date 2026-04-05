import React, { useState } from 'react';
import { Users, Plus } from 'lucide-react';
import { SearchBar } from '../components/SharedUI';

export const UsersDashboard: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('');

  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Invitation sent to ${newUserEmail} with role ${newUserRole}.`);
    setIsModalOpen(false);
    setNewUserEmail('');
    setNewUserRole('');
  };

  return (
    <div className="card catalog-manager-anim" style={{ maxWidth: '1400px' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={28}/> Account Users</h2>
          <p>Manage system access and roles.</p>
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
              <th>Role</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={3} className="empty-state">Database connection pending for users list.</td></tr>
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <form onSubmit={handleRegisterUser}>
              <div className="modal-header">
                <h3>Invite New User</h3>
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Email Address *</label>
                <input type="email" required value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>An email will be sent to set their password.</span>
              </div>
              <div className="form-group" style={{ marginBottom: '25px' }}>
                <label>Assign Role *</label>
                <select required value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                  <option value="">Select a Role...</option>
                  <option value="admin_role">Super Admin</option>
                  <option value="editor_role">Standard Editor</option>
                  <option value="viewer_role">Read Only</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="action btn-primary">Send Invitation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};