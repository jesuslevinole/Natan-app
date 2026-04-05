import React, { useState } from 'react';
import { Briefcase, ArrowLeft } from 'lucide-react';
import { AuditLogger } from '../utils/logger';

export const AuthScreen: React.FC<{ onLoginSuccess: (u: any) => void }> = ({ onLoginSuccess }) => {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Simulación de respuesta de Auth (Reemplazar con Firebase Auth real)
      const fakeUser = { uid: 'uid_123', username: email.split('@')[0], email, roleId: 'admin_role' };
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