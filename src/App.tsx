import { useState } from 'react';
import { PackageSearch, Briefcase, LogOut, BookOpen, BarChart2, Menu, ChevronRight, ChevronLeft } from 'lucide-react';
import { AuthScreen } from './components/SharedUI';
import { User } from './types';

// Importación de módulos refactorizados
import { CatalogsModule } from './modules/CatalogsModule';
import { ItemEntrance } from './modules/ItemEntranceModule';
import { WorkActivity } from './modules/WorkActivityModule';
import { ReportsModule } from './modules/ReportsModule';

import './App.css';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState<string>('workActivity'); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const handleLogin = (u: string) => setCurrentUser({ username: u, role: 'user' });

  if (!currentUser) return <AuthScreen onLogin={handleLogin} />;

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
          <li className={activeModule === 'workActivity' ? 'active' : ''} onClick={() => handleModuleChange('workActivity')}>
            <Briefcase size={20}/> <span>Work Activity</span>
          </li>
          <li className={activeModule === 'itemEntrance' ? 'active' : ''} onClick={() => handleModuleChange('itemEntrance')}>
            <PackageSearch size={20}/> <span>Item Entrance</span>
          </li>
          <li className={activeModule === 'catalogs' ? 'active' : ''} onClick={() => handleModuleChange('catalogs')}>
            <BookOpen size={20}/> <span>Catalogs</span>
          </li>
          <li className={activeModule === 'reports' ? 'active' : ''} onClick={() => handleModuleChange('reports')}>
            <BarChart2 size={20}/> <span>Reports</span>
          </li>
        </ul>
        <div className="sidebar-footer">
          <button type="button" className="action logout-btn" onClick={() => setCurrentUser(null)}>
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
          {activeModule === 'workActivity' && <WorkActivity currentUser={currentUser} />}
          {activeModule === 'itemEntrance' && <ItemEntrance />}
          {activeModule === 'catalogs' && <CatalogsModule />}
          {activeModule === 'reports' && <ReportsModule />}
        </main>
      </div>
    </div>
  );
}