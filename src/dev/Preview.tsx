import { Suspense, lazy, useState } from 'react';
import { DataContext } from '../context/dataContext';
import { AuthContext } from '../context/authContext';
import ImpersonationBanner from '../components/ImpersonationBanner';
import type { User, Role } from '../types';
import { mockAppData } from './mockData';
import LoadingScreen from '../components/LoadingScreen';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import NotificationsBell from '../components/NotificationsBell';
import '../index.css';
import '../App.css';

const modules = {
  dashboard: lazy(() => import('../modules/DashboardModule')),
  workActivity: lazy(() => import('../modules/WorkActivityModule')),
  itemEntrance: lazy(() => import('../modules/ItemEntranceModule')),
  catalogs: lazy(() => import('../modules/CatalogsModule')),
  reports: lazy(() => import('../modules/ReportsModule')),
  users: lazy(() => import('../modules/UsersDashboard')),
  roles: lazy(() => import('../modules/RolesDashboard')),
  settings: lazy(() => import('../modules/SettingsModule')),
  chat: lazy(() => import('../modules/ChatModule')),
};
type Key = keyof typeof modules;

/**
 * Vista previa de diseño con datos de ejemplo, sin Firebase ni login.
 * `npm run dev` y abrir http://localhost:5173/preview.html?module=reports
 */
export default function Preview() {
  const initial = (new URLSearchParams(window.location.search).get('module') as Key) || 'dashboard';
  const [active, setActive] = useState<Key>(initial in modules ? initial : 'dashboard');
  const Module = modules[active];
  const { theme, toggle } = useTheme();
  // "View as" simulado para la maqueta (sin Firestore).
  const realUser: User = { uid: 'preview', username: 'Preview', firstName: 'Jesus', lastName: 'Molero', email: 'preview@example.com', roleId: 'admin_role' };
  const [viewAs, setViewAs] = useState<{ user: User; role: Role | null } | null>(null);
  return (
    <AuthContext.Provider value={{
      currentUser: viewAs?.user ?? realUser,
      userRole: viewAs ? viewAs.role : { id: 'admin_role', name: 'Super Admin', permissions: [] },
      isRestoring: false, login: () => undefined, logout: async () => undefined, hasPermission: () => true,
      realUser,
      isImpersonating: viewAs !== null,
      startImpersonation: (user, role) => setViewAs({ user, role }),
      stopImpersonation: () => setViewAs(null),
    }}>
      <DataContext.Provider value={mockAppData}>
        <div className="preview-shell">
          <ImpersonationBanner />
          <nav className="preview-nav">
            {(Object.keys(modules) as Key[]).map(k => (
              <button key={k} type="button" className={`chip${k === active ? ' active' : ''}`} onClick={() => setActive(k)}>{k}</button>
            ))}
            <button type="button" className="chip" onClick={toggle} title="Toggle theme">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
            <NotificationsBell onNavigate={m => setActive((m in modules ? m : 'dashboard') as Key)} />
          </nav>
          <main className="preview-main">
            <Suspense fallback={<LoadingScreen message="Loading preview..." />}>
              {active === 'dashboard' ? <modules.dashboard onNavigate={m => setActive((m in modules ? m : 'dashboard') as Key)} /> : <Module onNavigate={() => undefined} />}
            </Suspense>
          </main>
        </div>
      </DataContext.Provider>
    </AuthContext.Provider>
  );
}
