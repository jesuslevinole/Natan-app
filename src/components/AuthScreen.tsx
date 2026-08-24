import { useState, type FormEvent } from 'react';
import { Briefcase, ArrowLeft, ShieldAlert } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../firebase';
import { AuditLogger } from '../utils/logger';
import { resolveSystemUser } from '../utils/auth';
import type { User } from '../types';
import './AuthScreen.css';

interface Props {
  /** Solo lo usa el acceso de desarrollo; el login real lo resuelve AuthProvider vía onAuthStateChanged. */
  onDevLogin: (user: User) => void;
}

const INVALID_CREDENTIAL_CODES = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'];

export default function AuthScreen({ onDevLogin }: Props) {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = await resolveSystemUser(credential.user);
      if (!user) {
        await signOut(auth);
        throw new Error('Access Denied: Your account has not been authorized by an Administrator.');
      }
      AuditLogger.logLogin(user.username);
      // AuthProvider recibe el usuario por onAuthStateChanged; no hace falta setearlo acá.
    } catch (error) {
      console.error(error);
      if (error instanceof FirebaseError && INVALID_CREDENTIAL_CODES.includes(error.code)) {
        setMessage('Invalid email or password.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Failed to authenticate.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ⚠️ Acceso sin credenciales para desarrollo local. Solo existe en `npm run dev`;
  // Vite elimina este bloque del build de producción (import.meta.env.DEV = false).
  const handleDevBypass = () => {
    const devUser: User = {
      uid: 'dev_admin_001',
      username: 'Dev Admin',
      firstName: 'Dev',
      lastName: 'Admin',
      email: 'dev@localhost',
      roleId: 'admin_role',
    };
    onDevLogin(devUser);
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage(`Password reset link sent to ${email}`);
      setTimeout(() => { setView('login'); setMessage(''); }, 4000);
    } catch {
      setMessage('Failed to send reset link. Check your email address.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="catalog-icon auth-logo"><Briefcase size={32} /></div>
        <h2>App Mr Natan</h2>

        {view === 'login' ? (
          <>
            <p className="subtitle">Secure System Login</p>
            {message && <p className="alert error">{message}</p>}
            <form onSubmit={handleLogin}>
              <div className="form-group mb-3">
                <label htmlFor="login-email">Email Address</label>
                <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoading} />
              </div>
              <button type="submit" className="auth-btn" disabled={isLoading}>
                {isLoading ? 'Authenticating...' : 'Log In'}
              </button>
            </form>

            <button type="button" className="toggle-auth" onClick={() => { setView('forgot'); setMessage(''); }}>
              Forgot your password?
            </button>

            {import.meta.env.DEV && (
              <div className="auth-dev-zone">
                <button type="button" className="btn-dashed" onClick={handleDevBypass}>
                  <ShieldAlert size={14} /> Dev access (local only)
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="subtitle">Reset your password</p>
            {message && <p className="alert success">{message}</p>}
            <form onSubmit={handleForgot}>
              <div className="form-group mb-4">
                <label htmlFor="forgot-email">Email Address</label>
                <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Enter your email" disabled={isLoading} />
              </div>
              <button type="submit" className="auth-btn mb-3" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" className="btn-secondary block" onClick={() => setView('login')} disabled={isLoading}>
                <ArrowLeft size={16} /> Back to Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
