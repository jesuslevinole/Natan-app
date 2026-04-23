import { useState } from 'react';
import { PackageSearch, Briefcase, LogOut, BookOpen, BarChart2, Menu, ChevronRight, ChevronLeft, ShieldAlert, Users as UsersIcon, ShieldCheck } from 'lucide-react';
import { AuthScreen } from './components/SharedUI'; 
import { AuthProvider, useAuth, RequirePermission } from './hooks/useAuth';

// Módulos
import { CatalogsModule } from './modules/CatalogsModule';
import { ItemEntrance } from './modules/ItemEntranceModule';
import { WorkActivity } from './modules/WorkActivityModule';
import { ReportsModule } from './modules/ReportsModule';
import { LogsDashboard } from './modules/LogsDashboard';
import { UsersDashboard } from './modules/UsersDashboard';
import { RolesDashboard } from './modules/RolesDashboard';

import './App.css';

function AppShell() {
  const { currentUser, logout } = useAuth();
  const [activeModule, setActiveModule] = useState<string>('workActivity'); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const handleModuleChange = (module: string) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="app-layout active">
      <div className={`sidebar-overlay ${isMobileMenuOpen ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}></div>
      
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon"><Briefcase size={24} /></div>
            {!isSidebarCollapsed && <span className="logo-text">Mr Natan</span>}
          </div>
          <button type="button" className="collapse-btn desktop-only" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
            {isSidebarCollapsed ? <ChevronRight size={20}/> : <ChevronLeft size={20}/>}
          </button>
        </div>
        
        <ul className="nav-links">
          {/* Módulos estándar controlados por permisos */}
          <RequirePermission permission="view_work_activity">
            <li className={activeModule === 'workActivity' ? 'active' : ''} onClick={() => handleModuleChange('workActivity')}>
              <Briefcase size={20}/> <span>Work Activity</span>
            </li>
          </RequirePermission>
          
          <RequirePermission permission="view_item_entrance">
            <li className={activeModule === 'itemEntrance' ? 'active' : ''} onClick={() => handleModuleChange('itemEntrance')}>
              <PackageSearch size={20}/> <span>Item Entrance</span>
            </li>
          </RequirePermission>
          
          <RequirePermission permission="view_catalogs">
            <li className={activeModule === 'catalogs' ? 'active' : ''} onClick={() => handleModuleChange('catalogs')}>
              <BookOpen size={20}/> <span>Catalogs</span>
            </li>
          </RequirePermission>
          
          <RequirePermission permission="view_reports">
            <li className={activeModule === 'reports' ? 'active' : ''} onClick={() => handleModuleChange('reports')}>
              <BarChart2 size={20}/> <span>Reports</span>
            </li>
          </RequirePermission>
          
          {/* Módulos Administrativos */}
          <RequirePermission permission="manage_security">
            <>
              <li className={activeModule === 'users' ? 'active' : ''} onClick={() => handleModuleChange('users')}>
                <UsersIcon size={20}/> <span>Account Users</span>
              </li>
              <li className={activeModule === 'roles' ? 'active' : ''} onClick={() => handleModuleChange('roles')}>
                <ShieldCheck size={20}/> <span>Manage Roles</span>
              </li>
              <li className={activeModule === 'audit_logs' ? 'active' : ''} onClick={() => handleModuleChange('audit_logs')}>
                <ShieldAlert size={20}/> <span>Activity History</span>
              </li>
            </>
          </RequirePermission>
        </ul>
        
        <div className="sidebar-footer">
          <div style={{ paddingBottom: '15px', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', display: isSidebarCollapsed ? 'none' : 'block' }}>
            Logged in as <b>{currentUser?.username}</b>
          </div>
          <button type="button" className="action logout-btn" onClick={logout}>
            <LogOut size={20}/> <span>Log Out</span>
          </button>
        </div>
      </aside>
      
      <div className="main-wrapper">
        <div className="mobile-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
            <Briefcase size={24} /> <h2>Mr Natan</h2>
          </div>
          <button type="button" className="icon-btn" style={{color: 'white'}} onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={28}/>
          </button>
        </div>

        <main className="main-content">
          {activeModule === 'workActivity' && <WorkActivity />}
          {activeModule === 'itemEntrance' && <ItemEntrance />}
          {activeModule === 'catalogs' && <CatalogsModule />}
          {activeModule === 'reports' && <ReportsModule />}
          {activeModule === 'users' && <UsersDashboard />}
          {activeModule === 'roles' && <RolesDashboard />}
          {activeModule === 'audit_logs' && <LogsDashboard />}
        </main>
      </div>
    </div>
  );
}

// Punto de entrada real
export default function App() {
  return (
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

const AuthConsumer = () => {
  const { currentUser, login } = useAuth();
  return currentUser ? <AppShell /> : <AuthScreen onLoginSuccess={login} />;
};