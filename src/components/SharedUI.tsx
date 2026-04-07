import React, { useState, useEffect, useRef } from 'react';
import { Search, Settings, X, Briefcase, ArrowLeft } from 'lucide-react';
import { formatSeq } from '../utils/helpers';
import { User } from '../types';
import { AuditLogger } from '../utils/logger';

export const SeqBadge: React.FC<{ seq?: number }> = ({ seq }) => (
  <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.9rem' }}>
    {formatSeq(seq)}
  </span>
);

export const SearchableSelect: React.FC<{
  options: { id: string; label: string; searchKeywords?: string; render?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  theme?: 'light' | 'dark';
}> = ({ options, value, onChange, placeholder = "Search...", required, theme = 'light' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) {
      const selectedOpt = options.find(o => o.id === value);
      if (selectedOpt) setSearchTerm(selectedOpt.label);
      else setSearchTerm('');
    }
  }, [value, options, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => {
    if (!searchTerm) return true; 
    const target = String(o.searchKeywords || o.label || '').toLowerCase();
    const searchTerms = String(searchTerm).toLowerCase().trim().split(/\s+/);
    return searchTerms.every(term => target.includes(term));
  }).sort((a, b) => String(a.label).localeCompare(String(b.label))); 

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          placeholder={placeholder}
          value={isOpen ? searchTerm : (options.find(o => o.id === value)?.label || '')}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (e.target.value === '') onChange('');
          }}
          onFocus={() => setIsOpen(true)}
          required={required && !value}
          style={{
            width: '100%', padding: '12px 40px 12px 14px', 
            border: isDark ? '1px solid rgba(255,255,255,0.3)' : '1px solid #cbd5e1',
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#ffffff',
            color: isDark ? '#ffffff' : '#334155',
            borderRadius: '8px', fontSize: '0.95rem', outline: 'none',
            transition: 'all 0.2s'
          }}
        />
        <Search size={18} color={isDark ? "#cbd5e1" : "#94a3b8"} style={{ position: 'absolute', right: '14px' }} />
      </div>
      
      {isOpen && (
        <ul style={{
          position: 'absolute', top: '100%', left: 0, right: 0, 
          background: isDark ? '#475569' : 'white', 
          border: isDark ? '1px solid #64748b' : '1px solid #e2e8f0', 
          borderRadius: '8px', marginTop: '6px', maxHeight: '350px', 
          overflowY: 'auto', zIndex: 100, listStyle: 'none', padding: '6px', 
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.25)'
        }}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
              <li
                key={opt.id}
                onMouseDown={() => {
                  onChange(opt.id);
                  setSearchTerm(opt.label);
                  setIsOpen(false);
                }}
                style={{ 
                  padding: '12px 14px', cursor: 'pointer', 
                  borderBottom: isDark ? '1px solid #64748b' : '1px solid #f1f5f9', 
                  color: isDark ? '#f8fafc' : '#334155',
                  borderRadius: '6px', transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? '#64748b' : '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {opt.render ? opt.render : opt.label}
              </li>
            ))
          ) : (
            <li style={{ padding: '15px', color: isDark ? '#cbd5e1' : '#94a3b8', fontSize: '0.95rem', textAlign: 'center' }}>No results found...</li>
          )}
        </ul>
      )}
    </div>
  );
};

export const SearchBar: React.FC<{ value: string, onChange: (val: string) => void }> = ({ value, onChange }) => (
  <div style={{ 
    display: 'flex', alignItems: 'center', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', 
    borderRadius: '24px', padding: '6px 16px', gap: '8px', width: '100%', maxWidth: '450px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.02), 0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s ease'
  }}>
    <Search size={16} color="#94a3b8" />
    <input 
      type="text" placeholder="Search records..." value={value} onChange={e => onChange(e.target.value)} 
      style={{ border: 'none', background: 'transparent', outline: 'none', color: '#334155', fontSize: '0.85rem', width: '100%', height: '20px' }} 
    />
  </div>
);

export const FieldConfigModal: React.FC<{
  isOpen: boolean; onClose: () => void; fields: { name: string; label: string }[];
  requiredFields: string[]; toggleRequired: (f: string) => void;
}> = ({ isOpen, onClose, fields, requiredFields, toggleRequired }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay active" style={{ zIndex: 2000 }}>
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={20}/> Required Fields</h3>
          <button type="button" className="close-modal" onClick={onClose}><X size={24}/></button>
        </div>
        <div style={{ padding: '15px 0' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
            Select which fields should be mandatory for this form.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fields.map(f => (
              <label key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.95rem' }}>
                <input 
                  type="checkbox" checked={requiredFields.includes(f.name)} onChange={() => toggleRequired(f.name)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="btn-container" style={{ marginTop: '20px' }}>
          <button type="button" className="action btn-primary" onClick={onClose} style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    </div>
  );
};

export const AuthScreen: React.FC<{ onLoginSuccess: (user: User) => void }> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 🔥 INYECTAMOS NOMBRE Y APELLIDO EN EL USUARIO SIMULADO
      const fakeUser: User = { 
        uid: 'uid_123', 
        username: email.split('@')[0], 
        firstName: 'Jesús', // Nombre base para pruebas
        lastName: 'Levinole', // Apellido base para pruebas
        email, 
        roleId: 'admin_role' 
      };
      
      AuditLogger.logLogin(fakeUser.username);
      onLoginSuccess(fakeUser);
    } catch (error: any) {
      setMessage('Invalid credentials.');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(`Password reset link sent to ${email}`);
    setTimeout(() => { setView('login'); setMessage(''); }, 3000);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="catalog-icon" style={{ marginBottom: '15px' }}><Briefcase size={32} /></div>
        <h2>App Mr Natan</h2>
        
        {view === 'login' ? (
          <>
            <p className="subtitle">Secure System Login</p>
            {message && <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>{message}</p>}
            <form onSubmit={handleLogin}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="auth-btn">Authenticate</button>
            </form>
            <p className="toggle-auth" onClick={() => { setView('forgot'); setMessage(''); }}>Forgot your password?</p>
          </>
        ) : (
          <>
            <p className="subtitle">Reset your password</p>
            {message && <p style={{ color: '#10b981', fontSize: '0.85rem', marginBottom: '10px', fontWeight: 'bold' }}>{message}</p>}
            <form onSubmit={handleForgot}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Enter your email" />
              </div>
              <button type="submit" className="auth-btn" style={{ marginBottom: '15px' }}>Send Reset Link</button>
              <button type="button" className="btn-secondary" style={{ width: '100%', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} onClick={() => setView('login')}>
                <ArrowLeft size={16} /> Back to Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};