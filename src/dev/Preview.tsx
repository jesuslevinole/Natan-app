import { Suspense, lazy, useState } from 'react';
import { DataContext } from '../context/dataContext';
import { AuthContext } from '../context/authContext';
import { mockAppData } from './mockData';
import LoadingScreen from '../components/LoadingScreen';
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
  return (
    <AuthContext.Provider value={{
      currentUser: { uid: 'preview', username: 'Preview', firstName: 'Jesus', email: 'preview@example.com', roleId: 'admin_role' },
      userRole: { id: 'admin_role', name: 'Super Admin', permissions: [] },
      isRestoring: false, login: () => undefined, logout: async () => undefined, hasPermission: () => true,
    }}>
      <DataContext.Provider value={mockAppData}>
        <div className="preview-shell">
          <nav className="preview-nav">
            {(Object.keys(modules) as Key[]).map(k => (
              <button key={k} type="button" className={`chip${k === active ? ' active' : ''}`} onClick={() => setActive(k)}>{k}</button>
            ))}
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
