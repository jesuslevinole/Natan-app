import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase'; 
import { BarChart2, Filter, Award, Activity, Wrench, MapPin, FileBarChart } from 'lucide-react';
import { JobOrder, JobProduct, SystemUser, ItemEntranceRecord, EntranceDetail } from '../types';
import { SearchableSelect } from '../components/SharedUI';
import { useCatalogOptions } from '../hooks/useAppHooks';
import { formatDateDisplay } from '../utils/helpers';

// 🔥 Tipo auxiliar para resolver datos del PO (header) a partir del JobProduct
interface EntranceLookup {
  // Mapa entranceId -> info del header del PO
  headerById: Map<string, { po: string; supplyCompany: string; date: string }>;
  // Mapa detailId -> entranceId (para poder llegar al header desde un JobProduct legacy o nuevo)
  entranceIdByDetailId: Map<string, string>;
  // Mapa entranceId -> array de detalles normalizados
  detailsByEntranceId: Map<string, EntranceDetail[]>;
}

export const ReportsModule: React.FC = () => {
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [allProducts, setAllProducts] = useState<JobProduct[]>([]);
  const [entranceList, setEntranceList] = useState<ItemEntranceRecord[]>([]); // 🔥 NUEVO
  const destinations = useCatalogOptions('catalog_destinations', 'description', 'property_name');
  
  const [accountUsers, setAccountUsers] = useState<{name: string, email: string}[]>([]);
  
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedDest, setSelectedDest] = useState<string>('');
  const [selectedWorker, setSelectedWorker] = useState<string>(''); 

  const [filterItemName, setFilterItemName] = useState<string>('');
  const [filterPO, setFilterPO] = useState<string>('');
  const [filterSerial, setFilterSerial] = useState<string>('');
  const [filterSupplyCompany, setFilterSupplyCompany] = useState<string>(''); // 🔥 NUEVO

  useEffect(() => {
    const fetchReportsData = async () => {
      const orderData = await getDocs(collection(db, "jobOrders"));
      const fetchedOrders = orderData.docs.map(doc => ({ ...doc.data(), id: doc.id } as JobOrder));
      setOrders(fetchedOrders);

      const prodData = await getDocs(collection(db, "jobProducts"));
      const fetchedProducts = prodData.docs.map(doc => ({ ...doc.data(), id: doc.id } as JobProduct));
      setAllProducts(fetchedProducts);

      // 🔥 NUEVO: traemos itemEntrance para poder enriquecer reportes con info del header (supply company, etc.)
      const entranceData = await getDocs(collection(db, "itemEntrance"));
      const normalizedEntrances = entranceData.docs.map(d => {
        const raw = { ...d.data(), id: d.id } as any;
        // Normalización legacy: si no tiene details[], construimos uno a partir de campos planos
        if (!Array.isArray(raw.details) || raw.details.length === 0) {
          raw.details = [{
            detailId: raw.id,
            itemName: raw.itemName || '',
            modelPart: raw.modelPart || '',
            serial: raw.serial || '',
            orderDate: raw.orderDate || '',
            itemsArrived: raw.itemsArrived || 0,
          }];
        }
        return raw as ItemEntranceRecord;
      });
      setEntranceList(normalizedEntrances);

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

  // 🔥 OPTIMIZACIÓN: Lookups de itemEntrance memoizados.
  // Antes se reconstruían los Maps en CADA render (incluyendo cada keystroke en los filtros),
  // lo cual congelaba la UI hasta que el usuario soltaba el teclado.
  // Ahora solo se recomputa cuando cambia entranceList.
  const entranceLookup: EntranceLookup = useMemo(() => {
    const headerById = new Map<string, { po: string; supplyCompany: string; date: string }>();
    const entranceIdByDetailId = new Map<string, string>();
    const detailsByEntranceId = new Map<string, EntranceDetail[]>();

    entranceList.forEach(e => {
      headerById.set(e.id, {
        po: e.po || '',
        supplyCompany: e.supplyCompany || '',
        date: e.date || ''
      });
      const details = e.details || [];
      detailsByEntranceId.set(e.id, details);
      details.forEach(d => entranceIdByDetailId.set(d.detailId, e.id));
    });

    return { headerById, entranceIdByDetailId, detailsByEntranceId };
  }, [entranceList]);

  // 🔥 useCallback: estabiliza la referencia para que los useMemo abajo no recalculen sin necesidad.
  const getSupplyCompanyForProduct = useCallback((p: JobProduct): string => {
    // Camino 1: tenemos entranceDetailId, resolvemos al entrance y de ahí al header
    if (p.entranceDetailId) {
      const eid = entranceLookup.entranceIdByDetailId.get(p.entranceDetailId);
      if (eid) return entranceLookup.headerById.get(eid)?.supplyCompany || '';
    }
    // Camino 2 (legacy): itemEntranceId apunta directo al doc del PO
    if (p.itemEntranceId) {
      return entranceLookup.headerById.get(p.itemEntranceId)?.supplyCompany || '';
    }
    return '';
  }, [entranceLookup]);

  // 🔥 Lista de supply companies únicos presentes (para el dropdown del filtro)
  // 🔥 Memoizado: solo se recomputa cuando entranceList cambia, no en cada keystroke.
  const supplyCompanyOptions = useMemo(() => {
    const set = new Set<string>();
    entranceList.forEach(e => {
      if (e.supplyCompany) set.add(e.supplyCompany);
    });
    return Array.from(set).sort();
  }, [entranceList]);

  // 🔥 Helper memoizado para comparar destination de manera flexible.
  // El filtro guarda el `property_name` (value), pero algunas órdenes pueden tener guardado
  // el `description` (label visible) en el campo destination. Aceptamos ambos.
  const destinationMatches = useCallback((orderDestination: string, selected: string): boolean => {
    if (!selected) return true;
    if (!orderDestination) return false;
    if (orderDestination === selected) return true;
    // Match contra el label correspondiente al selected (por si el order guarda el label)
    const selectedOption = destinations.find(d => String(d.value) === selected);
    if (selectedOption && orderDestination === String(selectedOption.label)) return true;
    return false;
  }, [destinations]);

  // 🔥 OPTIMIZACIÓN CRÍTICA: filteredOrders memoizado.
  // Solo se recomputa cuando cambia algún filtro o los datos base, no en cada render.
  // Sin esto, escribir en cualquier input causaba que se filtraran todas las órdenes
  // y productos en cada tecla, bloqueando la UI hasta que el usuario soltara el teclado.
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      let match = true;
      const orderDateStr = (o.createdAt || '').split('T')[0]; 
      if (startDate && orderDateStr < startDate) match = false;
      if (endDate && orderDateStr > endDate) match = false;
      if (selectedDest && !destinationMatches(o.destination, selectedDest)) match = false;
      
      if (selectedWorker && o.jobOrder !== selectedWorker) match = false;

      if (match && (filterItemName || filterPO || filterSerial || filterSupplyCompany)) {
        const orderProducts = allProducts.filter(p => p.jobOrderId === o.id);
        const hasMatchingProduct = orderProducts.some(p => {
          let pMatch = true;
          if (filterItemName && !(p.itemName || '').toLowerCase().includes(filterItemName.toLowerCase())) pMatch = false;
          if (filterPO && !(p.po || '').toLowerCase().includes(filterPO.toLowerCase())) pMatch = false;
          if (filterSerial && !(p.serial || '').toLowerCase().includes(filterSerial.toLowerCase())) pMatch = false;
          if (filterSupplyCompany) {
            const sc = getSupplyCompanyForProduct(p);
            if (sc !== filterSupplyCompany) pMatch = false;
          }
          return pMatch;
        });
        if (!hasMatchingProduct) match = false;
      }
      return match;
    });
  }, [
    orders, allProducts,
    startDate, endDate, selectedDest, selectedWorker,
    filterItemName, filterPO, filterSerial, filterSupplyCompany,
    destinationMatches, getSupplyCompanyForProduct
  ]);

  const filteredProductsDetailed = useMemo(() => {
    // Optimización: Map de orders por id para lookup O(1) en vez de O(n) por cada producto
    const orderById = new Map(filteredOrders.map(o => [o.id, o]));

    return allProducts.filter(p => {
      const order = orderById.get(p.jobOrderId);
      if (!order) return false;
      let pMatch = true;
      if (filterItemName && !(p.itemName || '').toLowerCase().includes(filterItemName.toLowerCase())) pMatch = false;
      if (filterPO && !(p.po || '').toLowerCase().includes(filterPO.toLowerCase())) pMatch = false;
      if (filterSerial && !(p.serial || '').toLowerCase().includes(filterSerial.toLowerCase())) pMatch = false;
      if (filterSupplyCompany) {
        const sc = getSupplyCompanyForProduct(p);
        if (sc !== filterSupplyCompany) pMatch = false;
      }
      return pMatch;
    }).map(p => {
      const order = orderById.get(p.jobOrderId);
      return {
        ...p,
        orderDate: order?.createdAt || '',
        orderDestination: order?.destination || '',
        orderWorker: order?.jobOrder || '',
        supplyCompany: getSupplyCompanyForProduct(p),
      };
    }).sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [
    allProducts, filteredOrders,
    filterItemName, filterPO, filterSerial, filterSupplyCompany,
    getSupplyCompanyForProduct
  ]);

  const totalWorks = filteredOrders.length;
  // 🔥 KPIs y agregados memoizados: solo recomputan cuando cambian filteredOrders/filteredProductsDetailed.
  const { totalItemsInstalled, aptList, mostWorkedApt, repeatedList, topWorkerEntry } = useMemo(() => {
    const totalItemsInstalledLocal = filteredProductsDetailed.reduce((sum, p) => sum + p.quantity, 0);

    const aptCounts: Record<string, number> = {};
    filteredOrders.forEach(o => { aptCounts[o.destination] = (aptCounts[o.destination] || 0) + 1; });
    const aptListLocal = Object.entries(aptCounts).map(([dest, count]) => ({ dest, count })).sort((a, b) => b.count - a.count);
    const mostWorkedAptLocal = aptListLocal.length > 0 ? aptListLocal[0] : null;

    const repeatedWorksCounts: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const key = `${o.destination} ||| ${o.description}`;
      repeatedWorksCounts[key] = (repeatedWorksCounts[key] || 0) + 1;
    });
    const repeatedListLocal = Object.entries(repeatedWorksCounts).map(([key, count]) => {
      const [dest, desc] = key.split(' ||| ');
      return { dest, desc, count };
    }).sort((a, b) => b.count - a.count);

    const workerCounts: Record<string, number> = {};
    filteredOrders.forEach(o => { workerCounts[o.jobOrder] = (workerCounts[o.jobOrder] || 0) + 1; });
    const topWorkerEntryLocal = Object.entries(workerCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalItemsInstalled: totalItemsInstalledLocal,
      aptList: aptListLocal,
      mostWorkedApt: mostWorkedAptLocal,
      repeatedList: repeatedListLocal,
      topWorkerEntry: topWorkerEntryLocal,
    };
  }, [filteredOrders, filteredProductsDetailed]);

  const productFiltersActive = !!(filterItemName || filterPO || filterSerial || filterSupplyCompany);

  // 🔥 poAggregate memoizado: solo recomputa cuando cambian sus dependencias.
  const poAggregate = useMemo(() => {
    return entranceList
      .map(entrance => {
        const details = entrance.details || [];
        const headerInfo = entranceLookup.headerById.get(entrance.id);

        // Filtro por supply company directo sobre el header
        if (filterSupplyCompany && headerInfo?.supplyCompany !== filterSupplyCompany) return null;

        // Filtro por PO# directo sobre el header
        if (filterPO && !(entrance.po || '').toLowerCase().includes(filterPO.toLowerCase())) return null;

        // Total inicial recibido (suma de todos los detalles)
        const totalArrived = details.reduce((sum, d) => sum + (d.itemsArrived || 0), 0);

        // Items instalados desde este PO: cuenta JobProducts vinculados al entrance o a cualquiera de sus detailIds
        const detailIdSet = new Set(details.map(d => d.detailId));
        const linkedProducts = allProducts.filter(p => {
          if (p.entranceDetailId && detailIdSet.has(p.entranceDetailId)) return true;
          // Legacy: JobProduct sin entranceDetailId pero con itemEntranceId apuntando a este PO
          if (!p.entranceDetailId && p.itemEntranceId === entrance.id) return true;
          return false;
        });

        // Si hay filtros de producto (itemName / serial), aplicarlos al consumo
        const matchingProducts = linkedProducts.filter(p => {
          if (filterItemName && !(p.itemName || '').toLowerCase().includes(filterItemName.toLowerCase())) return false;
          if (filterSerial && !(p.serial || '').toLowerCase().includes(filterSerial.toLowerCase())) return false;
          return true;
        });

        // Si hay filtros activos de producto y no hay match, excluir el PO del reporte
        if (productFiltersActive && matchingProducts.length === 0) {
          // Excepción: si solo el filtro de supply company / PO estaba activo, igual lo mostramos (header matchea).
          const onlyHeaderFilters = !filterItemName && !filterSerial;
          if (!onlyHeaderFilters) return null;
        }

        const installed = matchingProducts.reduce((sum, p) => sum + p.quantity, 0);
        const remaining = totalArrived - linkedProducts.reduce((sum, p) => sum + p.quantity, 0);

        return {
          entranceId: entrance.id,
          po: entrance.po || '-',
          supplyCompany: entrance.supplyCompany || '-',
          date: entrance.date || '',
          productsCount: details.length,
          totalArrived,
          installed,
          remaining,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.po || '').localeCompare(a.po || ''));
  }, [
    entranceList, allProducts, entranceLookup,
    filterItemName, filterPO, filterSerial, filterSupplyCompany,
    productFiltersActive
  ]);

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
            <label>Address</label>
            {/* 🔥 FIX: incluimos opción explícita "All Addresses" en lugar de una vacía sin label.
                 También filtramos destinations vacíos para evitar opciones rotas. */}
            <SearchableSelect 
              theme="dark"
              options={[
                { id: '', label: 'All Addresses' },
                ...destinations
                  .filter(d => d.value && d.label)
                  .map(d => ({
                    id: String(d.value), 
                    label: String(d.label)
                  }))
              ]}
              value={selectedDest} 
              onChange={setSelectedDest} 
              placeholder="-- Search Address --"
            />
          </div>
          <div className="form-group">
            <label>Account User</label>
            <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)} style={{ padding: '8px' }}>
              <option value="" style={{color: 'black'}}>All Account Users</option>
              {accountUsers.map((user, idx) => (
                <option key={idx} value={user.name} style={{color: 'black'}}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group"><label>Item Name</label><input type="text" placeholder="Search by name..." value={filterItemName} onChange={e => setFilterItemName(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group"><label>PO #</label><input type="text" placeholder="Search PO..." value={filterPO} onChange={e => setFilterPO(e.target.value)} style={{ padding: '8px' }}/></div>
          <div className="form-group"><label>Serial #</label><input type="text" placeholder="Search serial..." value={filterSerial} onChange={e => setFilterSerial(e.target.value)} style={{ padding: '8px' }}/></div>
          {/* 🔥 NUEVO: Filtro por Supply Company */}
          <div className="form-group">
            <label>Supply Company</label>
            <select value={filterSupplyCompany} onChange={e => setFilterSupplyCompany(e.target.value)} style={{ padding: '8px' }}>
              <option value="" style={{color: 'black'}}>All Companies</option>
              {supplyCompanyOptions.map((sc, idx) => (
                <option key={idx} value={sc} style={{color: 'black'}}>{sc}</option>
              ))}
            </select>
          </div>
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
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Top Address</p>
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
            <h4 style={{ margin: 0, color: '#334155' }}>Works per Address</h4>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '350px', overflowY: 'auto' }}>
            <table className="responsive-table">
              <thead><tr><th>Address</th><th style={{ textAlign: 'center' }}>Total Interventions</th></tr></thead>
              <tbody>
                {aptList.length === 0 && <tr><td colSpan={2} className="empty-state">No data available.</td></tr>}
                {aptList.map((item, i) => (
                  <tr key={i}>
                    <td data-label="Address" style={{ fontWeight: 'bold' }}>{getDestLabel(item.dest)}</td>
                    <td data-label="Total" style={{ textAlign: 'center' }}><span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: 0, color: '#334155' }}>Repeated Tasks per Address</h4>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '350px', overflowY: 'auto' }}>
            <table className="responsive-table">
              <thead><tr><th>Address</th><th>Description (Task)</th><th style={{ textAlign: 'center' }}>Times Done</th></tr></thead>
              <tbody>
                {repeatedList.length === 0 && <tr><td colSpan={3} className="empty-state">No data available.</td></tr>}
                {repeatedList.map((item, i) => (
                  <tr key={i}>
                    <td data-label="Address">{getDestLabel(item.dest)}</td>
                    <td data-label="Desc" style={{ color: '#475569' }}>{item.desc}</td>
                    <td data-label="Times" style={{ textAlign: 'center' }}><span style={{ backgroundColor: item.count > 1 ? '#fef2f2' : '#f0fdf4', color: item.count > 1 ? '#ef4444' : '#22c55e', padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold' }}>{item.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 🔥 NUEVA SECCIÓN: Items por PO (Purchase Order) */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileBarChart size={20} style={{ color: 'var(--primary-color)' }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, color: '#334155' }}>Items by Purchase Order</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Inventory consumption tracked per PO. Shows how many items were received vs installed vs remaining in stock.
            </p>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <strong>{poAggregate.length}</strong> POs
          </span>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, maxHeight: '400px', overflowY: 'auto' }}>
          <table className="responsive-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Date</th>
                <th>Supply Company</th>
                <th style={{ textAlign: 'center' }}># Products</th>
                <th style={{ textAlign: 'center' }}>Items Received</th>
                <th style={{ textAlign: 'center' }}>Items Installed</th>
                <th style={{ textAlign: 'center' }}>Remaining Stock</th>
                <th style={{ textAlign: 'center' }}>Usage</th>
              </tr>
            </thead>
            <tbody>
              {poAggregate.length === 0 && <tr><td colSpan={8} className="empty-state">No POs found for current filters.</td></tr>}
              {poAggregate.map((row, i) => {
                const usagePercent = row.totalArrived > 0 ? Math.round((row.installed / row.totalArrived) * 100) : 0;
                const isDepleted = row.remaining <= 0;
                return (
                  <tr key={row.entranceId || i}>
                    <td data-label="PO" style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{row.po}</td>
                    <td data-label="Date">{formatDateDisplay(row.date)}</td>
                    <td data-label="Company" style={{ color: '#475569' }}>{row.supplyCompany}</td>
                    <td data-label="Products" style={{ textAlign: 'center' }}>{row.productsCount}</td>
                    <td data-label="Received" style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.totalArrived}</td>
                    <td data-label="Installed" style={{ textAlign: 'center' }}>
                      <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>
                        -{row.installed}
                      </span>
                    </td>
                    <td data-label="Remaining" style={{ textAlign: 'center' }}>
                      <span style={{ 
                        backgroundColor: isDepleted ? '#fef2f2' : '#f0fdf4', 
                        color: isDepleted ? '#ef4444' : '#22c55e', 
                        padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' 
                      }}>
                        {row.remaining}
                      </span>
                    </td>
                    <td data-label="Usage" style={{ textAlign: 'center', minWidth: '120px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, backgroundColor: '#e2e8f0', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${Math.min(usagePercent, 100)}%`, 
                            height: '100%', 
                            backgroundColor: usagePercent >= 100 ? '#ef4444' : usagePercent >= 70 ? '#f97316' : '#3b82f6',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', minWidth: '36px', textAlign: 'right' }}>{usagePercent}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
              <tr>
                <th>Date</th>
                <th>Address</th>
                <th>Account User</th>
                <th>Item Name</th>
                <th>Model #</th>
                <th>Serial #</th>
                <th>PO #</th>
                <th>Supply Company</th>{/* 🔥 NUEVO */}
                <th style={{ textAlign: 'center' }}>Qty Installed</th>
              </tr>
            </thead>
            <tbody>
              {filteredProductsDetailed.length === 0 && <tr><td colSpan={9} className="empty-state">No products found for current filters.</td></tr>}
              {filteredProductsDetailed.map((p, i) => (
                <tr key={i}>
                  <td data-label="Date">{formatDateDisplay(p.orderDate)}</td>
                  <td data-label="Address">{getDestLabel(p.orderDestination)}</td>
                  <td data-label="Account User" style={{ fontWeight: 'bold', color: '#334155' }}>{p.orderWorker}</td>
                  <td data-label="Item" style={{ fontWeight: 'bold' }}>{p.itemName}</td>
                  <td data-label="Model" style={{ color: '#475569' }}>{p.modelPart || '-'}</td>
                  <td data-label="Serial" style={{ color: '#475569' }}>{p.serial || '-'}</td>
                  <td data-label="PO" style={{ color: 'var(--primary-color)', fontWeight: '600' }}>{p.po || '-'}</td>
                  <td data-label="Company" style={{ color: '#475569' }}>{p.supplyCompany || '-'}</td>
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