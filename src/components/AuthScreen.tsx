import { useState, type FormEvent } from 'react';
import { Briefcase, ArrowLeft, ShieldAlert } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../firebase';
import { AuditLogger } from '../utils/logger';
import { resolveSystemUser } from '../utils/auth';
import { useCompany } from '../hooks/useCompany';
import type { User } from '../types';
import './AuthScreen.css';

interface Props {
  /** Solo lo usa el acceso de desarrollo; el login real lo resuelve AuthProvider vía onAuthStateChanged. */
  onDevLogin: (user: User) => void;
}

const INVALID_CREDENTIAL_CODES = ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'];

export default function AuthScreen({ onDevLogin }: Props) {
  const { company } = useCompany();
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('error');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setMessageKind('error');
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
    const target = email.trim().toLowerCase();
    setIsLoading(true);
    setMessage('');
    try {
      try {
        // Con `url`, el botón "Continue" de la página de Firebase vuelve a la app.
        await sendPasswordResetEmail(auth, target, { url: window.location.origin });
      } catch (error) {
        // El dominio no está en Authentication → Settings → Authorized domains: enviamos sin continue URL.
        if (error instanceof FirebaseError && error.code === 'auth/unauthorized-continue-uri') {
          await sendPasswordResetEmail(auth, target);
        } else {
          throw error;
        }
      }
      setMessageKind('success');
      setMessage(`If ${target} has an account, a reset link is on its way. Check your spam folder if it doesn't arrive within a few minutes.`);
    } catch (error) {
      setMessageKind('error');
      if (error instanceof FirebaseError) {
        if (error.code === 'auth/invalid-email') setMessage('That email address is not valid.');
        else if (error.code === 'auth/user-not-found') setMessage('No account found with that email.');
        else if (error.code === 'auth/too-many-requests') setMessage('Too many attempts. Please wait a few minutes and try again.');
        else setMessage(`Could not send the reset link (${error.code}).`);
      } else {
        setMessage('Could not send the reset link. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className={`auth-logo${company.logo ? ' has-logo' : ''}`}>
          {company.logo ? <img src={company.logo} alt={company.name} /> : <Briefcase size={32} />}
        </div>
        <h2>{company.name}</h2>

        {view === 'login' ? (
          <>
            <p className="subtitle">{company.tagline || 'Secure System Login'}</p>
            {message && <p className={`alert ${messageKind}`}>{message}</p>}
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

            <button type="button" className="toggle-auth" onClick={() => { setView('forgot'); setMessage(''); setMessageKind('error'); }}>
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
            {message && <p className={`alert ${messageKind}`}>{message}</p>}
            <p className="hint">Enter the email of your account. Firebase will send you a link to choose a new password.</p>
            <form onSubmit={handleForgot}>
              <div className="form-group mb-4">
                <label htmlFor="forgot-email">Email Address</label>
                <input id="forgot-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Enter your email" disabled={isLoading} />
              </div>
              <button type="submit" className="auth-btn mb-3" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" className="btn-secondary block" onClick={() => { setView('login'); setMessage(''); }} disabled={isLoading}>
                <ArrowLeft size={16} /> Back to Login
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
