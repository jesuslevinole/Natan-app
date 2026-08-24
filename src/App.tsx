import { useState, lazy, Suspense, type ReactNode } from 'react';
import {
  PackageSearch, Briefcase, LogOut, BookOpen, BarChart2, Menu, ChevronRight, ChevronLeft,
  ShieldAlert, Users as UsersIcon, ShieldCheck, LayoutDashboard,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './context/AuthProvider';
import { DataProvider } from './context/DataProvider';
import './App.css';

// Code-splitting: cada módulo se descarga la primera vez que se abre, no todo en el login.
const DashboardModule = lazy(() => import('./modules/DashboardModule'));
const WorkActivityModule = lazy(() => import('./modules/WorkActivityModule'));
const ItemEntranceModule = lazy(() => import('./modules/ItemEntranceModule'));
const CatalogsModule = lazy(() => import('./modules/CatalogsModule'));
const ReportsModule = lazy(() => import('./modules/ReportsModule'));
const UsersDashboard = lazy(() => import('./modules/UsersDashboard'));
const RolesDashboard = lazy(() => import('./modules/RolesDashboard'));
const LogsDashboard = lazy(() => import('./modules/LogsDashboard'));

export type ModuleId = 'dashboard' | 'workActivity' | 'itemEntrance' | 'catalogs' | 'reports' | 'users' | 'roles' | 'audit_logs';

interface NavItem {
  id: ModuleId;
  label: string;
  icon: ReactNode;
  /** Permiso requerido; `null` = visible para cualquier usuario autenticado. */
  permission: string | null;
  section?: 'admin';
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, permission: null },
  { id: 'workActivity', label: 'Work Activity', icon: <Briefcase size={20} />, permission: 'view_work_activity' },
  { id: 'itemEntrance', label: 'Item Entrance', icon: <PackageSearch size={20} />, permission: 'view_item_entrance' },
  { id: 'catalogs', label: 'Catalogs', icon: <BookOpen size={20} />, permission: 'view_catalogs' },
  { id: 'reports', label: 'Reports', icon: <BarChart2 size={20} />, permission: 'view_reports' },
  { id: 'users', label: 'Account Users', icon: <UsersIcon size={20} />, permission: 'manage_security', section: 'admin' },
  { id: 'roles', label: 'Manage Roles', icon: <ShieldCheck size={20} />, permission: 'manage_security', section: 'admin' },
  { id: 'audit_logs', label: 'Activity History', icon: <ShieldAlert size={20} />, permission: 'manage_security', section: 'admin' },
];

function AppShell() {
  const { currentUser, logout, hasPermission } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleModuleChange = (module: ModuleId) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false);
  };

  const visibleItems = NAV_ITEMS.filter(item => item.permission === null || hasPermission(item.permission));

  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard': return <DashboardModule onNavigate={handleModuleChange} />;
      case 'workActivity': return <WorkActivityModule />;
      case 'itemEntrance': return <ItemEntranceModule />;
      case 'catalogs': return <CatalogsModule />;
      case 'reports': return <ReportsModule />;
      case 'users': return <UsersDashboard />;
      case 'roles': return <RolesDashboard />;
      case 'audit_logs': return <LogsDashboard />;
    }
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay${isMobileMenuOpen ? ' active' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />

      <aside className={`sidebar${isSidebarCollapsed ? ' collapsed' : ''}${isMobileMenuOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon"><Briefcase size={24} /></div>
            <span className="logo-text">Mr Natan</span>
          </div>
          <button type="button" className="collapse-btn desktop-only" onClick={() => setIsSidebarCollapsed(v => !v)} title="Toggle sidebar">
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        <ul className="nav-links">
          {visibleItems.map(item => (
            <li
              key={item.id}
              className={activeModule === item.id ? 'active' : ''}
              onClick={() => handleModuleChange(item.id)}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              {item.icon} <span>{item.label}</span>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="sidebar-user">Logged in as <b>{currentUser?.username}</b></div>
          <button type="button" className="action logout-btn" onClick={logout}>
            <LogOut size={20} /> <span>Log Out</span>
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="mobile-header">
          <div className="mobile-brand">
            <Briefcase size={24} /> <h2>Mr Natan</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => setIsMobileMenuOpen(true)} title="Open menu">
            <Menu size={28} />
          </button>
        </div>

        <main className="main-content">
          <Suspense fallback={<LoadingScreen />}>{renderModule()}</Suspense>
        </main>
      </div>
    </div>
  );
}

function AuthGate() {
  const { currentUser, isRestoring, login } = useAuth();
  if (isRestoring) return <div className="auth-wrapper"><LoadingScreen message="Restoring session..." /></div>;
  if (!currentUser) return <AuthScreen onDevLogin={login} />;
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
