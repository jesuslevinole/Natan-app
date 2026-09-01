import { useState, lazy, Suspense, type ReactNode } from 'react';
import {
  PackageSearch, Briefcase, LogOut, BookOpen, BarChart2, Menu, ChevronRight, ChevronLeft,
  ShieldAlert, Users as UsersIcon, ShieldCheck, LayoutDashboard, Settings, Sun, Moon,
} from 'lucide-react';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './context/AuthProvider';
import { DataProvider } from './context/DataProvider';
import { CompanyProvider } from './context/CompanyProvider';
import { useCompany } from './hooks/useCompany';
import { useTheme } from './hooks/useTheme';
import BrandMark from './components/BrandMark';
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
const SettingsModule = lazy(() => import('./modules/SettingsModule'));

export type ModuleId = 'dashboard' | 'workActivity' | 'itemEntrance' | 'catalogs' | 'reports' | 'users' | 'roles' | 'audit_logs' | 'settings';

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
  { id: 'users', label: 'Account Users', icon: <UsersIcon size={20} />, permission: 'view_users', section: 'admin' },
  { id: 'roles', label: 'Manage Roles', icon: <ShieldCheck size={20} />, permission: 'view_roles', section: 'admin' },
  { id: 'audit_logs', label: 'Activity History', icon: <ShieldAlert size={20} />, permission: 'view_logs', section: 'admin' },
  { id: 'settings', label: 'Business Settings', icon: <Settings size={20} />, permission: 'manage_settings', section: 'admin' },
];

function AppShell() {
  const { currentUser, userRole, logout, hasPermission } = useAuth();
  const { company } = useCompany();
  const { theme, toggle: toggleTheme } = useTheme();
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
      case 'settings': return <SettingsModule />;
    }
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay${isMobileMenuOpen ? ' active' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />

      <aside className={`sidebar${isSidebarCollapsed ? ' collapsed' : ''}${isMobileMenuOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <BrandMark size={36} />
            <span className="logo-text">{company.name}</span>
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
          <button type="button" className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div className="sidebar-user">
            Logged in as <b>{currentUser?.username}</b>
            <span className={`sidebar-role ${userRole ? '' : 'missing'}`}>{userRole ? userRole.name : 'No role assigned'}</span>
          </div>
          <button type="button" className="action logout-btn" onClick={logout}>
            <LogOut size={20} /> <span>Log Out</span>
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="mobile-header">
          <div className="mobile-brand">
            <BrandMark size={28} /> <h2>{company.name}</h2>
          </div>
          <div className="flex-row">
            <button type="button" className="theme-toggle" onClick={toggleTheme} title="Toggle dark mode">
              {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            </button>
            <button type="button" className="icon-btn" onClick={() => setIsMobileMenuOpen(true)} title="Open menu">
              <Menu size={28} />
            </button>
          </div>
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
    <CompanyProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </CompanyProvider>
  );
}
