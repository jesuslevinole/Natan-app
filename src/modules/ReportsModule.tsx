import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase'; 
import { BarChart2, Filter, Award, Activity, Wrench, MapPin } from 'lucide-react';
import { JobOrder, JobProduct, SystemUser } from '../types';
import { SearchableSelect } from '../components/SharedUI';
import { useCatalogOptions } from '../hooks/useAppHooks';
import { formatDateDisplay } from '../utils/helpers';

export const ReportsModule: React.FC = () => {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [allProducts, setAllProducts] = useState<JobProduct[]>([]);
  const destinations = useCatalogOptions('destinations', 'description', 'property_name');
  
  // 🔥 AHORA CARGAMOS LA LISTA OFICIAL DE USUARIOS (Con ID y Nombre Completo)
  const [accountUsers, setAccountUsers] = useState<{name: string, email: string}[]>([]);
  
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedDest, setSelectedDest] = useState<string>('');
  const [selectedWorker, setSelectedWorker] = useState<string>(''); // Nombre del trabajador

  const [filterItemName, setFilterItemName] = useState<string>('');
  const [filterPO, setFilterPO] = useState<string>('');
  const [filterSerial, setFilterSerial] = useState<string>('');

  useEffect(() => {
    const fetchReportsData = async () => {
      // 1. Órdenes de Trabajo
      const orderData = await getDocs(collection(db, "jobOrders"));
      const fetchedOrders = orderData.docs.map(doc => ({ ...doc.data(), id: doc.id } as JobOrder));
      setOrders(fetchedOrders);

      // 2. Productos
      const prodData = await getDocs(collection(db, "jobProducts"));
      const fetchedProducts = prodData.docs.map(doc => ({ ...doc.data(), id: doc.id } as JobProduct));
      setAllProducts(fetchedProducts);

      // 🔥 3. CONSULTA ESTRICTA A LA TABLA DE USUARIOS PARA EL DROPDOWN
      const usersData = await getDocs(collection(db, "users"));
      const fetchedUsers = usersData.docs.map(doc => {
        const u = doc.data() as SystemUser;
        return {
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          email: u.email
        };
      });
      setAccountUsers(fetchedUsers);
    };
    
    fetchReportsData();
  }, []);

  const filteredOrders = orders.filter(o => {
    let match = true;
    const orderDateStr = o.createdAt.split('T')[0]; 
    if (startDate && orderDateStr < startDate) match = false;
    if (endDate && orderDateStr > endDate) match = false;
    if (selectedDest && o.destination !== selectedDest) match = false;
    
    // Filtro por nombre del trabajador (o.jobOrder guarda el nombre del autor)
    if (selectedWorker && o.jobOrder !== selectedWorker) match = false;

    if (match && (filterItemName || filterPO || filterSerial)) {
      const orderProducts = allProducts.filter(p => p.jobOrderId === o.id);
      const hasMatchingProduct = orderProducts.some(p => {
        let pMatch = true;
        if (filterItemName && !(p.itemName || '').toLowerCase().includes(filterItemName.toLowerCase())) pMatch = false;
        if (filterPO && !(p.po || '').toLowerCase().includes(filterPO.toLowerCase())) pMatch = false;
        if (filterSerial && !(p.serial || '').toLowerCase().includes(filterSerial.toLowerCase())) pMatch = false;
        return pMatch;
      });
      if (!hasMatchingProduct) match = false;
    }
    return match;
  });

  const filteredProductsDetailed = allProducts.filter(p => {
    const order = filteredOrders.find(o => o.id === p.jobOrderId);
    if (!order) return false;
    let pMatch = true;
    if (filterItemName && !(p.itemName || '').toLowerCase().includes(filterItemName.toLowerCase())) pMatch = false;
    if (filterPO && !(p.po || '').toLowerCase().includes(filterPO.toLowerCase())) pMatch = false;
    if (filterSerial && !(p.serial || '').toLowerCase().includes(filterSerial.toLowerCase())) pMatch = false;
    return pMatch;
  }).map(p => {
    const order = filteredOrders.find(o => o.id === p.jobOrderId);
    return {
      ...p,
      orderDate: order?.createdAt || '',
      orderDestination: order?.destination || '',
      orderWorker: order?.jobOrder || ''
    };
  }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

  const totalWorks = filteredOrders.length;
  const totalItemsInstalled = filteredProductsDetailed.reduce((sum, p) => sum + p.quantity, 0);
  
  const aptCounts: Record<string, number> = {};
  filteredOrders.forEach(o => { aptCounts[o.destination] = (aptCounts[o.destination] || 0) + 1; });
  const aptList = Object.entries(aptCounts).map(([dest, count]) => ({ dest, count })).sort((a, b) => b.count - a.count);
  const mostWorkedApt = aptList.length > 0 ? aptList[0] : null;

  const repeatedWorksCounts: Record<string, number> = {};
  filteredOrders.forEach(o => {
    const key = `${o.destination} ||| ${o.description}`;
    repeatedWorksCounts[key] = (repeatedWorksCounts[key] || 0) + 1;
  });
  const repeatedList = Object.entries(repeatedWorksCounts).map(([key, count]) => {
    const [dest, desc] = key.split(' ||| ');
    return { dest, desc, count };
  }).sort((a, b) => b.count - a.count);

  const workerCounts: Record<string, number> = {};
  filteredOrders.forEach(o => { workerCounts[o.jobOrder] = (workerCounts[o.jobOrder] || 0) + 1; });
  const topWorkerEntry = Object.entries(workerCounts).sort((a, b) => b[1] - a[1])[0];

  const getDestLabel = (val: string) => {
    const d = destinations.find(x => x.value === val);
    return d ? d.label : val;
  };

  return (
    <div className="card catalog-manager-anim" style={{ maxWidth: '1400px' }}>
      <style>{`
        .dark-filter-panel label { color: #e2e8f0 !important; font-size: 0.75rem !important; text-transform: uppercase; letter-spacing: 0.5px; }
        .dark-filter-panel input, .dark-filter-panel select { background-color: rgba(255, 255, 255, 0.1) !important; border: 1px solid rgba(255, 255, 255, 0.3) !important; color: white !important; border-radius: 8px; }
        .dark-filter-panel input:focus, .dark-filter-panel select:focus, .searchable-input-dark:focus { border-color: #60a5fa !important; box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.3) !important; background-color: rgba(255, 255, 255, 0.15) !important; }
        .dark-filter-panel input::placeholder { color: #cbd5e1 !important; }
        .dark-filter-panel input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; }
      `}</style>

      <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div className="card-header-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><BarChart2 size={28}/> Analytics & Reports</h2>
          <p>Analyze work activities, locations, and products installed.</p>
        </div>
      </div>

      <div className="dark-filter-panel" style={{ 
        backgroundColor: '#475569', padding: '25px', borderRadius: '16px', 
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', 
        marginBottom: '30px', marginTop: '15px', border: '1px solid #64748b' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '8px', borderRadius: '8px', color: '#ffffff' }}>
            <Filter size={20} /> 
          </div>
          <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: 600 }}>Command Center Filters</h3>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
          <div className="form-group"><label>Start Date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group"><label>End Date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group">
            <label>Destination (Apt)</label>
            <SearchableSelect 
              theme="dark"
              options={[{id: '', label: '', searchKeywords: ''}, ...destinations.map(d => ({id: d.value, label: d.label, searchKeywords: `${d.label} ${d.value}`}))]}
              value={selectedDest} onChange={setSelectedDest} placeholder="-- Select Apt --"
            />
          </div>
          <div className="form-group">
            <label>Account User</label>
            <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)} style={{ padding: '8px' }}>
              <option value="" style={{color: 'black'}}>All Account Users</option>
              {/* 🔥 AHORA MAPEA ÚNICAMENTE A LOS USUARIOS REALES DEL SISTEMA */}
              {accountUsers.map((user, idx) => (
                <option key={idx} value={user.name} style={{color: 'black'}}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group"><label>Item Name</label><input type="text" placeholder="Search by name..." value={filterItemName} onChange={e => setFilterItemName(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group"><label>PO #</label><input type="text" placeholder="Search PO..." value={filterPO} onChange={e => setFilterPO(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group"><label>Serial #</label><input type="text" placeholder="Search serial..." value={filterSerial} onChange={e => setFilterSerial(e.target.value)} style={{ padding: '8px' }}/></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '16px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#3b82f6', color: 'white', padding: '12px', borderRadius: '12px' }}><Activity size={24}/></div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Activities</p>
            <h3 style={{ margin: 0, fontSize: '1.6rem', color: '#1e293b' }}>{totalWorks}</h3>
          </div>
        </div>
        <div style={{ backgroundColor: '#fdf4ff', padding: '20px', borderRadius: '16px', border: '1px solid #f5d0fe', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#d946ef', color: 'white', padding: '12px', borderRadius: '12px' }}><Wrench size={24}/></div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Items Installed</p>
            <h3 style={{ margin: 0, fontSize: '1.6rem', color: '#1e293b' }}>{totalItemsInstalled}</h3>
          </div>
        </div>
        <div style={{ backgroundColor: '#f0fdf4', padding: '20px', borderRadius: '16px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#22c55e', color: 'white', padding: '12px', borderRadius: '12px' }}><MapPin size={24}/></div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Top Apt.</p>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', lineHeight: '1.2' }}>{mostWorkedApt ? getDestLabel(mostWorkedApt.dest) : '-'}</h3>
          </div>
        </div>
        <div style={{ backgroundColor: '#fff7ed', padding: '20px', borderRadius: '16px', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#f97316', color: 'white', padding: '12px', borderRadius: '12px' }}><Award size={24}/></div>
          <div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Top Account User</p>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>{topWorkerEntry ? topWorkerEntry[0] : '-'}</h3>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px', marginBottom: '30px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: 0, color: '#334155' }}>Works per Apartment</h4>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '350px', overflowY: 'auto' }}>
            <table className="responsive-table">
              <thead><tr><th>Destination (Apt)</th><th style={{ textAlign: 'center' }}>Total Interventions</th></tr></thead>
              <tbody>
                {aptList.length === 0 && <tr><td colSpan={2} className="empty-state">No data available.</td></tr>}
                {aptList.map((item, i) => (
                  <tr key={i}>
                    <td data-label="Apt" style={{ fontWeight: 'bold' }}>{getDestLabel(item.dest)}</td>
                    <td data-label="Total" style={{ textAlign: 'center' }}><span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: 0, color: '#334155' }}>Repeated Tasks per Apartment</h4>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '350px', overflowY: 'auto' }}>
            <table className="responsive-table">
              <thead><tr><th>Destination</th><th>Description (Task)</th><th style={{ textAlign: 'center' }}>Times Done</th></tr></thead>
              <tbody>
                {repeatedList.length === 0 && <tr><td colSpan={3} className="empty-state">No data available.</td></tr>}
                {repeatedList.map((item, i) => (
                  <tr key={i}>
                    <td data-label="Apt">{getDestLabel(item.dest)}</td>
                    <td data-label="Desc" style={{ color: '#475569' }}>{item.desc}</td>
                    <td data-label="Times" style={{ textAlign: 'center' }}><span style={{ backgroundColor: item.count > 1 ? '#fef2f2' : '#f0fdf4', color: item.count > 1 ? '#ef4444' : '#22c55e', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: 0, color: '#334155' }}>Products Installed Log</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Detailed list of materials used in the filtered activities.</p>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '450px', overflowY: 'auto' }}>
          <table className="responsive-table">
            <thead>
              <tr><th>Date</th><th>Apt / Dest</th><th>Account User</th><th>Item Name</th><th>Model #</th><th>Serial #</th><th>PO #</th><th style={{ textAlign: 'center' }}>Qty Installed</th></tr>
            </thead>
            <tbody>
              {filteredProductsDetailed.length === 0 && <tr><td colSpan={8} className="empty-state">No products found for current filters.</td></tr>}
              {filteredProductsDetailed.map((p, i) => (
                <tr key={i}>
                  <td data-label="Date">{formatDateDisplay(p.orderDate)}</td>
                  <td data-label="Apt">{getDestLabel(p.orderDestination)}</td>
                  <td data-label="Account User" style={{ fontWeight: 'bold', color: '#334155' }}>{p.orderWorker}</td>
                  <td data-label="Item" style={{ fontWeight: 'bold' }}>{p.itemName}</td>
                  <td data-label="Model" style={{ color: '#475569' }}>{p.modelPart || '-'}</td>
                  <td data-label="Serial" style={{ color: '#475569' }}>{p.serial || '-'}</td>
                  <td data-label="PO" style={{ color: '#475569' }}>{p.po || '-'}</td>
                  <td data-label="Qty" style={{ textAlign: 'center' }}><span style={{ backgroundColor: '#fef2f2', color: '#ef4444', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>-{p.quantity}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};