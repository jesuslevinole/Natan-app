import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { displayName } from '../utils/helpers';
import './ImpersonationBanner.css';

/**
 * Banner fijo del modo "view as": recuerda al admin que está viendo la app como
 * otro usuario (con el rol de ese usuario) y permite salir con un clic.
 */
export default function ImpersonationBanner() {
  const { isImpersonating, currentUser, userRole, realUser, stopImpersonation } = useAuth();
  if (!isImpersonating || !currentUser) return null;
  return (
    <div className="impersonation-banner" role="status">
      <span className="impersonation-text">
        <Eye size={15} />
        <span>
          <b>Test mode:</b> viewing as <b>{displayName(currentUser, currentUser.username)}</b>
          {userRole ? <> · role <b>{userRole.name}</b></> : <> · <b>no role assigned</b></>}
          <small> — you are still {realUser ? displayName(realUser, realUser.username) : 'yourself'}; actions are logged with your name.</small>
        </span>
      </span>
      <button type="button" className="impersonation-exit" onClick={stopImpersonation}>
        <LogOut size={14} /> Exit test mode
      </button>
    </div>
  );
}
