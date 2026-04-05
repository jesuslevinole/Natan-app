import React, { useState, useEffect, useRef } from 'react';
import { Search, Settings, X, Briefcase } from 'lucide-react';
import { formatSeq } from '../utils/helpers';

/** Badge elegante para los números de consecutivo (#) */
export const SeqBadge: React.FC<{ seq?: number }> = ({ seq }) => (
  <span style={{ color: '#64748b', fontWeight: 'bold', fontSize: '0.9rem' }}>
    {formatSeq(seq)}
  </span>
);

/** Select con Buscador Integrado y Filtro Optimizado */
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

  // 🔥 SOLUCIÓN DEL BUG: Sincronizar solo cuando está cerrado.
  // Evita que el componente borre lo que el usuario está escribiendo al actualizarse el estado padre.
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

  // 🔥 FILTRO ESTRICTO Y ORDEN ALFABÉTICO
  const filteredOptions = options.filter(o => {
    if (!searchTerm) return true; // Mostrar todo si no hay búsqueda
    const target = String(o.searchKeywords || o.label || '').toLowerCase();
    const term = String(searchTerm).trim().toLowerCase();
    return target.includes(term);
  }).sort((a, b) => String(a.label).localeCompare(String(b.label))); // Orden elegante (A-Z)

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
          className={isDark ? "searchable-input-dark" : "searchable-input-light"}
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

/** Buscador elegante para tablas */
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

/** Modal para Configurar Campos Obligatorios */
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

/** Pantalla de Login */
export const AuthScreen: React.FC<{ onLogin: (u: string, p: string) => void }> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) onLogin(username, password);
    else { alert("Registration submitted!\nWait for Admin approval."); setIsLogin(true); }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="catalog-icon" style={{ marginBottom: '15px' }}><Briefcase size={32} /></div>
        <h2>App Mr Natan</h2>
        <p className="subtitle">{isLogin ? "Welcome Back" : "Create Account"}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '15px' }}><label>Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <div className="form-group"><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="auth-btn">{isLogin ? 'Log In' : 'Sign Up'}</button>
        </form>
      </div>
    </div>
  );
};