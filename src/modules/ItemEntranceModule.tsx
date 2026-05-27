import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { PackageSearch, Plus, X, Settings, Edit2, Trash2, Maximize2, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { ItemEntranceRecord, JobProduct, JobOrder, ItemEntranceFormData, Role, EntranceDetail } from '../types';
import { SearchBar, SeqBadge, SearchableSelect } from '../components/SharedUI';
import { useCatalogOptions, useFormConfig } from '../hooks/useAppHooks';
import { getTodayString, formatDateDisplay, getInventoryStatusStyles } from '../utils/helpers';
import { AuditLogger } from '../utils/logger';
import { useAuth, RequirePermission } from '../hooks/useAuth';

// Helper para generar IDs únicos por detalle (sin dependencias externas)
const generateDetailId = () => `det_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const ItemEntrance: React.FC = () => {
  const { currentUser } = useAuth();
  const authorName = currentUser 
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.username 
    : 'Unknown User';

  const [items, setItems] = useState<ItemEntranceRecord[]>([]);
  const [allJobProducts, setAllJobProducts] = useState<JobProduct[]>([]);
  const [allOrders, setAllOrders] = useState<JobOrder[]>([]); 
  const [systemRoles, setSystemRoles] = useState<Role[]>([]); 
  
  const [searchTerm, setSearchTerm] = useState(''); 
  const [stockFilter, setStockFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL'); 
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isExpandHistoryOpen, setIsExpandHistoryOpen] = useState<boolean>(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // 🔥 Estado para el detalle visualizado en el historial
  const [selectedHistoryDetailId, setSelectedHistoryDetailId] = useState<string | null>(null);
  
  const supplyCompanies = useCatalogOptions('supply_companies', 'company');
  const catalogItemNames = useCatalogOptions('item_names', 'item_name', 'item_name');

  // 🔥 Campos del HEADER (PO general)
  const entranceFields = [
    { name: 'date', label: 'Date (Registration)' },
    { name: 'supplyCompany', label: 'Supply Company' },
    { name: 'po', label: 'PO #' },
  ];
  
  // 🔥 Campos del DETALLE (productos)
  const detailFields = [
    { name: 'itemName', label: 'Item Name' },
    { name: 'modelPart', label: 'Model / Part #' },
    { name: 'serial', label: 'Serial #' },
    { name: 'orderDate', label: 'Arrived Date' },
    { name: 'itemsArrived', label: 'Items Arrived' },
  ];
  
  const { toggleRequired: toggleItemReq, isRequired: isItemReq } = useFormConfig('itemEntrance', ['date', 'supplyCompany', 'po']);
  const { toggleRequired: toggleDetailReq, isRequired: isDetailReq } = useFormConfig('itemEntranceDetail', ['itemName', 'itemsArrived']);

  const [fieldRoles, setFieldRoles] = useState<Record<string, string>>({});

  // 🔥 Form: ItemEntranceFormData ya incluye `details` (definido en types.ts)
  const initialForm: ItemEntranceFormData = {
    date: getTodayString(), 
    po: '', 
    supplyCompany: '', 
    details: [],
    // Campos legacy: se rellenan a partir del primer detalle al guardar.
    // Se inicializan vacíos aquí para mantener consistencia.
    modelPart: '', 
    serial: '', 
    orderDate: '', 
    quantityOrdered: 0, 
    itemsArrived: 0, 
    itemName: '',
  };
  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);

  // Detalle en edición/adición dentro del modal
  const emptyDetail: EntranceDetail = {
    detailId: '',
    itemName: '',
    modelPart: '',
    serial: '',
    orderDate: '',
    itemsArrived: 0,
  };
  const [detailDraft, setDetailDraft] = useState<EntranceDetail>(emptyDetail);
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);

  const collectionRef = collection(db, "itemEntrance");

  const fetchItems = async () => {
    const data = await getDocs(collectionRef);
    const fetched = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    
    fetched.sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
    
    const totalItems = fetched.length;
    const mapped = fetched.map((item: any, idx: number) => ({ 
      ...item, 
      visualSeq: item.seq || (totalItems - idx),
      // 🔥 Backward compatibility: si el registro no tiene "details", lo construimos a partir de los campos legacy
      details: Array.isArray(item.details) && item.details.length > 0
        ? item.details
        : [{
            detailId: item.id, // usamos el doc id como detailId para registros legacy
            itemName: item.itemName || '',
            modelPart: item.modelPart || '',
            serial: item.serial || '',
            orderDate: item.orderDate || '',
            itemsArrived: item.itemsArrived || 0,
          }]
    }));
    
    setItems(mapped as ItemEntranceRecord[]);

    const prodData = await getDocs(collection(db, "jobProducts"));
    setAllJobProducts(prodData.docs.map(doc => ({ ...doc.data(), id: doc.id }) as JobProduct));
    
    const ordersData = await getDocs(collection(db, "jobOrders"));
    setAllOrders(ordersData.docs.map(doc => ({ ...doc.data(), id: doc.id }) as JobOrder));
    
    const rolesSnap = await getDocs(collection(db, 'roles'));
    setSystemRoles(rolesSnap.docs.map(d => ({id: d.id, ...d.data()} as Role)));
  };

  useEffect(() => { 
    fetchItems(); 
    const savedFieldRoles = localStorage.getItem('itemEntrance_fieldRoles');
    if (savedFieldRoles) setFieldRoles(JSON.parse(savedFieldRoles));
  }, []);

  const isFieldEditable = (fieldName: string) => {
    if (isProcessing) return false;
    if (currentUser?.roleId === 'admin_role') return true; 
    const requiredRole = fieldRoles[fieldName];
    if (requiredRole && currentUser?.roleId !== requiredRole) return false;
    return true; 
  };

  // 🔥 Stock por DETALLE: busca consumo por entranceDetailId (nuevo) o por itemEntranceId (legacy)
  const getDetailStock = (entranceId: string, detail: EntranceDetail) => {
    const used = allJobProducts
      .filter(p => 
        p.entranceDetailId === detail.detailId || 
        // Legacy: registros antiguos donde JobProduct.itemEntranceId apuntaba al doc completo
        (!p.entranceDetailId && p.itemEntranceId === entranceId)
      )
      .reduce((acc, p) => acc + p.quantity, 0);
    return detail.itemsArrived - used;
  };

  // 🔥 Stock total del PO (suma de stocks de detalles)
  const getEntranceTotalStock = (item: any) => {
    const details: EntranceDetail[] = item.details || [];
    const totalArrived = details.reduce((sum, d) => sum + (d.itemsArrived || 0), 0);
    const totalUsed = details.reduce((sum, d) => sum + (d.itemsArrived - getDetailStock(item.id, d)), 0);
    return { stock: totalArrived - totalUsed, total: totalArrived };
  };

  // 🔥 Historial filtrado por detalle seleccionado
  const itemHistory = allJobProducts
    .filter(p => {
      if (!editingId) return false;
      if (selectedHistoryDetailId) {
        return p.entranceDetailId === selectedHistoryDetailId;
      }
      // Si no hay detalle seleccionado, mostrar todos los del PO completo
      return p.itemEntranceId === editingId || 
             (formData.details ?? []).some(d => p.entranceDetailId === d.detailId);
    })
    .map(p => {
      const order = allOrders.find(o => o.id === p.jobOrderId);
      const matchedDetail = formData.details?.find(d => d.detailId === p.entranceDetailId);
      return {
        id: p.id,
        quantity: p.quantity,
        jobOrder: order?.jobOrder || 'Unknown',
        destination: order?.destination || 'Unknown',
        date: order?.createdAt || '',
        itemName: matchedDetail?.itemName || '',
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredHistory = itemHistory.filter(h => {
    const s = historySearchTerm.toLowerCase();
    return (
      h.jobOrder.toLowerCase().includes(s) || 
      h.destination.toLowerCase().includes(s) || 
      h.itemName.toLowerCase().includes(s) ||
      formatDateDisplay(h.date).includes(s)
    );
  });

  // 🔥 Generador de PO consecutivo: PO000, PO001, PO002...
  const formatPONumber = (n: number) => `PO${String(n).padStart(3, '0')}`;

  const generateNextPO = async (): Promise<string> => {
    const counterRef = doc(db, 'counters', 'poSeq');
    const nextNum = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      // 🔥 Inicia en 0 para que el primer PO sea PO000
      let newValue = 0;
      if (counterDoc.exists()) {
        const current = counterDoc.data().value;
        newValue = (typeof current === 'number' ? current + 1 : 0);
        transaction.update(counterRef, { value: newValue });
      } else {
        transaction.set(counterRef, { value: 0 });
      }
      return newValue;
    });
    return formatPONumber(nextNum);
  };

  const handleOpenModal = async (item: ItemEntranceRecord | null = null) => {
    if (item) { 
      setEditingId(item.id); 
      setFormData({
        date: item.date || '',
        itemName: item.itemName || '',
        modelPart: item.modelPart || '',
        serial: item.serial || '',
        po: item.po || '',
        orderDate: item.orderDate || '',
        quantityOrdered: item.quantityOrdered || 0,
        itemsArrived: item.itemsArrived || 0,
        supplyCompany: item.supplyCompany || '',
        details: Array.isArray(item.details) ? item.details : []
      }); 
    } else { 
      setEditingId(null); 
      // 🔥 Pre-generamos el PO consecutivo al abrir el modal de creación
      try {
        const nextPO = await generateNextPO();
        setFormData({ ...initialForm, date: getTodayString(), po: nextPO, details: [] }); 
      } catch (err) {
        console.error('Error generating PO sequence:', err);
        setFormData({ ...initialForm, date: getTodayString(), details: [] });
      }
    }
    setDetailDraft(emptyDetail);
    setEditingDetailId(null);
    setSelectedHistoryDetailId(null);
    setIsModalOpen(true);
  };

  // 🔥 Agregar o actualizar un detalle al array
  const handleAddOrUpdateDetail = () => {
    if (!detailDraft.itemName.trim()) {
      alert('Item Name is required for each detail.');
      return;
    }
    if (!detailDraft.itemsArrived || detailDraft.itemsArrived <= 0) {
      alert('Items Arrived must be greater than 0.');
      return;
    }

    if (editingDetailId) {
      setFormData(prev => ({
        ...prev,
        details: (prev.details ?? []).map(d => d.detailId === editingDetailId ? { ...detailDraft, detailId: editingDetailId } : d)
      }));
      setEditingDetailId(null);
    } else {
      const newDetail: EntranceDetail = { ...detailDraft, detailId: generateDetailId() };
      setFormData(prev => ({ ...prev, details: [...(prev.details ?? []), newDetail] }));
    }
    setDetailDraft(emptyDetail);
  };

  const handleEditDetail = (detail: EntranceDetail) => {
    setDetailDraft({ ...detail });
    setEditingDetailId(detail.detailId);
  };

  const handleRemoveDetail = (detailId: string) => {
    // Validar que el detalle no tenga consumo en JobProducts
    const hasUsage = allJobProducts.some(p => p.entranceDetailId === detailId);
    if (hasUsage) {
      alert('Cannot remove this product: it has already been used in one or more job orders.');
      return;
    }
    if (!window.confirm('Remove this product from the PO?')) return;
    setFormData(prev => ({ ...prev, details: (prev.details ?? []).filter(d => d.detailId !== detailId) }));
    if (editingDetailId === detailId) {
      setEditingDetailId(null);
      setDetailDraft(emptyDetail);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    const details = formData.details ?? [];
    if (details.length === 0) {
      alert('Please add at least one product detail before saving.');
      return;
    }

    setIsProcessing(true);
    try {
      // 🔥 Payload: header + details (mantenemos algunos campos legacy a partir del primer detalle para compatibilidad)
      const firstDetail = details[0];
      const payload: any = {
        date: formData.date,
        supplyCompany: formData.supplyCompany,
        po: formData.po,
        details: details,
        // Campos legacy (para no romper otras vistas que aún los lean directamente)
        itemName: firstDetail?.itemName || '',
        modelPart: firstDetail?.modelPart || '',
        serial: firstDetail?.serial || '',
        orderDate: firstDetail?.orderDate || '',
        itemsArrived: details.reduce((sum, d) => sum + (d.itemsArrived || 0), 0),
      };

      if (editingId) {
        await updateDoc(doc(db, "itemEntrance", editingId), payload);
        AuditLogger.logUpdate('Item Entrance', authorName, editingId, payload);
      } else {
        const counterRef = doc(db, 'counters', 'itemEntranceSeq');
        const nextSeq = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let newSeq = 1;
          if (counterDoc.exists()) {
            newSeq = (counterDoc.data().value || 0) + 1;
            transaction.update(counterRef, { value: newSeq });
          } else {
            transaction.set(counterRef, { value: 1 });
          }
          return newSeq;
        });

        const docRef = await addDoc(collectionRef, { 
          ...payload, 
          seq: nextSeq, 
          createdAt: new Date().toISOString() 
        });
        AuditLogger.logCreate('Item Entrance', authorName, docRef.id, payload);
      }
      await fetchItems();
      setIsModalOpen(false);
    } catch (error) { 
      console.error("Error saving data", error); 
      alert("Error saving record.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteEntrance = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this entrance record permanently?")) {
      const recordToDelete = items.find(i => i.id === id);
      await deleteDoc(doc(db, "itemEntrance", id));
      AuditLogger.logDelete('Item Entrance', authorName, id, recordToDelete);
      fetchItems();
    }
  };

  const toggleRowExpansion = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredItems = items.filter((item: any) => {
    const { stock } = getEntranceTotalStock(item);
    let matchStock = true;
    if (stockFilter === 'AVAILABLE') matchStock = stock > 0;
    if (stockFilter === 'UNAVAILABLE') matchStock = stock <= 0;

    const searchLower = searchTerm.toLowerCase();
    const details: EntranceDetail[] = item.details || [];
    const matchSearch = (
      String(item.po || '').toLowerCase().includes(searchLower) ||
      String(item.supplyCompany || '').toLowerCase().includes(searchLower) ||
      formatDateDisplay(item.date).includes(searchLower) ||
      details.some(d => 
        String(d.itemName || '').toLowerCase().includes(searchLower) ||
        String(d.modelPart || '').toLowerCase().includes(searchLower) ||
        String(d.serial || '').toLowerCase().includes(searchLower)
      )
    );

    return matchStock && matchSearch;
  });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PackageSearch size={24}/> Item Entrance</h2>
          <p>Register incoming products by PO</p>
        </div>
        
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px', gap: '4px' }}>
            <button type="button" onClick={() => setStockFilter('ALL')} style={{ padding: '4px 16px', borderRadius: '6px', border: 'none', backgroundColor: stockFilter === 'ALL' ? '#ffffff' : 'transparent', boxShadow: stockFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: stockFilter === 'ALL' ? 'bold' : 'normal', color: '#334155', fontSize: '0.85rem', transition: 'all 0.2s' }}>
              All
            </button>
            <button type="button" onClick={() => setStockFilter('AVAILABLE')} style={{ padding: '4px 16px', borderRadius: '6px', border: 'none', backgroundColor: stockFilter === 'AVAILABLE' ? '#ffffff' : 'transparent', boxShadow: stockFilter === 'AVAILABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: stockFilter === 'AVAILABLE' ? 'bold' : 'normal', color: '#10b981', fontSize: '0.85rem', transition: 'all 0.2s' }}>
              Available
            </button>
            <button type="button" onClick={() => setStockFilter('UNAVAILABLE')} style={{ padding: '4px 16px', borderRadius: '6px', border: 'none', backgroundColor: stockFilter === 'UNAVAILABLE' ? '#ffffff' : 'transparent', boxShadow: stockFilter === 'UNAVAILABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', fontWeight: stockFilter === 'UNAVAILABLE' ? 'bold' : 'normal', color: '#ef4444', fontSize: '0.85rem', transition: 'all 0.2s' }}>
              Unavailable
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flex: 1, justifyContent: 'flex-end', minWidth: '150px' }}>
          <RequirePermission permission="add_item_entrance">
            <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
              <Plus size={18}/> New Entrance
            </button>
          </RequirePermission>
        </div>
      </div>

      {/* 🔥 Tabla principal: muestra el PO como header con detalles expandibles */}
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
              <th>#</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Date</th>
              <th>PO #</th>
              <th>Company</th>
              <th style={{ textAlign: 'center' }}>Products</th>
              <th>Total Stock</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && <tr><td colSpan={8} className="empty-state">No records found.</td></tr>}
            {filteredItems.map((item: any) => {
              const { stock, total } = getEntranceTotalStock(item);
              const isAvailable = stock > 0;
              const details: EntranceDetail[] = item.details || [];
              const isExpanded = expandedRows.has(item.id);
              return (
                <React.Fragment key={item.id}>
                  <tr className="clickable-row">
                    <td data-label="Actions" style={{ textAlign: 'center' }}>
                      <div className="action-btns" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          className="icon-btn"
                          onClick={(e) => toggleRowExpansion(item.id, e)}
                          title={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                        </button>
                        <RequirePermission permission="edit_item_entrance">
                          <button 
                            className="icon-btn edit" 
                            onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }}
                            title="Edit Record"
                          >
                            <Edit2 size={16}/>
                          </button>
                        </RequirePermission>
                        <RequirePermission permission="delete_item_entrance">
                          <button 
                            className="icon-btn delete" 
                            onClick={(e) => handleDeleteEntrance(item.id, e)}
                            title="Delete Record"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </RequirePermission>
                      </div>
                    </td>
                    <td data-label="#" onClick={() => handleOpenModal(item)}><SeqBadge seq={item.visualSeq} /></td>
                    <td data-label="Status" style={{ textAlign: 'center' }} onClick={() => handleOpenModal(item)}>
                      <span style={getInventoryStatusStyles(isAvailable)}>
                        {isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                      </span>
                    </td>
                    <td data-label="Date" onClick={() => handleOpenModal(item)}>{formatDateDisplay(item.date)}</td>
                    <td data-label="PO" style={{fontWeight: 'bold', color: 'var(--primary-color)'}} onClick={() => handleOpenModal(item)}>{item.po || '-'}</td>
                    <td data-label="Company" onClick={() => handleOpenModal(item)}>{item.supplyCompany || '-'}</td>
                    <td data-label="Products" style={{ textAlign: 'center', fontWeight: 'bold' }} onClick={() => handleOpenModal(item)}>{details.length}</td>
                    <td data-label="Stock" style={{ color: isAvailable ? 'inherit' : '#ef4444', fontWeight: isAvailable ? 'normal' : 'bold' }} onClick={() => handleOpenModal(item)}>
                      {stock} / {total}
                    </td>
                  </tr>
                  {isExpanded && details.length > 0 && (
                    <tr>
                      <td colSpan={8} style={{ backgroundColor: '#f8fafc', padding: '15px 30px' }}>
                        <table className="responsive-table" style={{ backgroundColor: 'white', borderRadius: '6px' }}>
                          <thead>
                            <tr>
                              <th>Item Name</th>
                              <th>Model / Part #</th>
                              <th>Serial #</th>
                              <th>Arrived Date</th>
                              <th style={{ textAlign: 'center' }}>Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.map((d) => {
                              const detailStock = getDetailStock(item.id, d);
                              const detailAvail = detailStock > 0;
                              return (
                                <tr key={d.detailId}>
                                  <td style={{ fontWeight: 'bold' }}>{d.itemName}</td>
                                  <td>{d.modelPart || '-'}</td>
                                  <td style={{ fontWeight: '600' }}>{d.serial || '-'}</td>
                                  <td>{d.orderDate ? formatDateDisplay(d.orderDate) : '-'}</td>
                                  <td style={{ textAlign: 'center', color: detailAvail ? 'inherit' : '#ef4444', fontWeight: detailAvail ? 'normal' : 'bold' }}>
                                    {detailStock} / {d.itemsArrived}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Config modal (incluye header fields + detail fields) */}
      {isConfigOpen && (
        <div className="modal-overlay active" style={{ zIndex: 2000 }}>
          <div className="modal-content modal-large" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={20}/> Form Security & Fields</h3>
              <button type="button" className="close-modal" onClick={() => setIsConfigOpen(false)}><X size={24}/></button>
            </div>
            <div style={{ padding: '15px 0' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                Set which fields are mandatory and configure Field-Level Security (which Role is allowed to edit each field).
              </p>
              <h4 style={{ margin: '10px 0', color: 'var(--primary-color)' }}>PO Header Fields</h4>
              <div className="table-container">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>Field Name</th>
                      <th style={{ textAlign: 'center' }}>Required</th>
                      <th>Allowed Role (Edit Access)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entranceFields.map(f => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{f.label}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isItemReq(f.name)} 
                            onChange={() => toggleItemReq(f.name)} 
                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td>
                          <select 
                            value={fieldRoles[f.name] || ''} 
                            onChange={e => {
                              const updated = { ...fieldRoles, [f.name]: e.target.value };
                              if (!e.target.value) delete updated[f.name];
                              setFieldRoles(updated);
                              localStorage.setItem('itemEntrance_fieldRoles', JSON.stringify(updated));
                            }}
                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                          >
                            <option value="">All Roles (Unrestricted)</option>
                            {systemRoles.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 style={{ margin: '20px 0 10px 0', color: 'var(--primary-color)' }}>Product Detail Fields</h4>
              <div className="table-container">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>Field Name</th>
                      <th style={{ textAlign: 'center' }}>Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailFields.map(f => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{f.label}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isDetailReq(f.name)} 
                            onChange={() => toggleDetailReq(f.name)} 
                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="btn-container" style={{ marginTop: '20px' }}>
              <button type="button" className="action btn-primary" onClick={() => setIsConfigOpen(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 Modal principal: header + sección de detalles */}
      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <form onSubmit={handleSave}>
              <div className="modal-header">
                <h3>{editingId ? "Edit Entrance" : "New Entrance"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <RequirePermission permission="manage_security">
                    <button type="button" className="icon-btn" onClick={() => setIsConfigOpen(true)} title="Configure Field Security"><Settings size={20}/></button>
                  </RequirePermission>
                  <button type="submit" className="action btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                </div>
              </div>

              {/* 🔥 HEADER del PO */}
              <div className="form-grid">
                <div className="form-group">
                  <label>Date (Registration) {isItemReq('date') && '*'} {!isFieldEditable('date') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required={isItemReq('date')} disabled={!isFieldEditable('date')} style={{ backgroundColor: !isFieldEditable('date') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('date') ? 'not-allowed' : 'text' }}/>
                </div>

                <div className="form-group">
                  <label>Supply Company {isItemReq('supplyCompany') && '*'} {!isFieldEditable('supplyCompany') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <div style={{ pointerEvents: !isFieldEditable('supplyCompany') ? 'none' : 'auto', opacity: !isFieldEditable('supplyCompany') ? 0.6 : 1 }}>
                    <SearchableSelect 
                      options={supplyCompanies.map(c => ({ id: String(c.label || c.value || ''), label: String(c.label || c.value || '') })).filter(o => o.label !== '')}
                      value={formData.supplyCompany} 
                      onChange={(id) => setFormData({...formData, supplyCompany: id})} 
                      placeholder="-- Select Company --"
                      required={isItemReq('supplyCompany')}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>PO # {isItemReq('po') && '*'} <span style={{fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:'normal'}}>(auto-generated)</span></label>
                  <input 
                    type="text" 
                    value={formData.po} 
                    readOnly
                    style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', fontWeight: 'bold', color: 'var(--primary-color)' }}
                  />
                </div>
              </div>

              {/* 🔥 SECCIÓN DETALLES */}
              <div style={{ marginTop: '25px', borderTop: '2px solid var(--primary-color)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Products in this PO</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Add one or more products to this Purchase Order</p>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Total products: <strong>{(formData.details ?? []).length}</strong>
                  </span>
                </div>

                {/* Formulario inline para agregar/editar detalle */}
                <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Item Name {isDetailReq('itemName') && '*'}</label>
                      <SearchableSelect 
                        options={catalogItemNames.map(c => ({ id: String(c.label || c.value || ''), label: String(c.label || c.value || '') })).filter(o => o.label !== '')}
                        value={detailDraft.itemName} 
                        onChange={(val) => setDetailDraft({...detailDraft, itemName: val})} 
                        placeholder="-- Search from Catalog --"
                      />
                    </div>
                    <div className="form-group">
                      <label>Model / Part # {isDetailReq('modelPart') && '*'}</label>
                      <input type="text" value={detailDraft.modelPart} onChange={e => setDetailDraft({...detailDraft, modelPart: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Serial # {isDetailReq('serial') && '*'}</label>
                      <input type="text" value={detailDraft.serial} onChange={e => setDetailDraft({...detailDraft, serial: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Arrived Date {isDetailReq('orderDate') && '*'}</label>
                      <input type="date" value={detailDraft.orderDate} onChange={e => setDetailDraft({...detailDraft, orderDate: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>Items Arrived {isDetailReq('itemsArrived') && '*'}</label>
                      <input type="number" min="0" value={detailDraft.itemsArrived} onChange={e => setDetailDraft({...detailDraft, itemsArrived: Number(e.target.value)})} />
                    </div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="action btn-primary"
                        onClick={handleAddOrUpdateDetail}
                        style={{ width: '100%' }}
                      >
                        <Plus size={16}/> {editingDetailId ? 'Update Product' : 'Add Product'}
                      </button>
                      {editingDetailId && (
                        <button 
                          type="button" 
                          className="action btn-secondary"
                          onClick={() => { setEditingDetailId(null); setDetailDraft(emptyDetail); }}
                          title="Cancel edit"
                        >
                          <X size={16}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabla de detalles ya agregados */}
                <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
                        <th>Item Name</th>
                        <th>Model / Part #</th>
                        <th>Serial #</th>
                        <th>Arrived Date</th>
                        <th style={{ textAlign: 'center' }}>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(formData.details ?? []).length === 0 && (
                        <tr><td colSpan={6} className="empty-state">No products added yet. Use the form above to add products to this PO.</td></tr>
                      )}
                      {(formData.details ?? []).map((d) => {
                        const detailStock = editingId ? getDetailStock(editingId, d) : d.itemsArrived;
                        const detailAvail = detailStock > 0;
                        return (
                          <tr key={d.detailId}>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button 
                                  type="button" 
                                  className="icon-btn edit" 
                                  onClick={() => handleEditDetail(d)}
                                  title="Edit product"
                                >
                                  <Edit2 size={14}/>
                                </button>
                                <button 
                                  type="button" 
                                  className="icon-btn delete" 
                                  onClick={() => handleRemoveDetail(d.detailId)}
                                  title="Remove product"
                                >
                                  <Trash2 size={14}/>
                                </button>
                                {editingId && (
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => setSelectedHistoryDetailId(d.detailId)}
                                    title="View history for this product"
                                  >
                                    <PackageSearch size={14}/>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 'bold' }}>{d.itemName}</td>
                            <td>{d.modelPart || '-'}</td>
                            <td style={{ fontWeight: '600' }}>{d.serial || '-'}</td>
                            <td>{d.orderDate ? formatDateDisplay(d.orderDate) : '-'}</td>
                            <td style={{ textAlign: 'center', color: detailAvail ? 'inherit' : '#ef4444', fontWeight: detailAvail ? 'normal' : 'bold' }}>
                              {detailStock} / {d.itemsArrived}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </form>

            {/* 🔥 Installation History: ahora muestra el historial del detalle seleccionado o de todo el PO */}
            {editingId && (
              <div className="products-section" style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <div className="products-header">
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>
                      Installation History
                      {selectedHistoryDetailId && (
                        <span style={{ fontSize: '0.85rem', fontWeight: 'normal', marginLeft: '10px' }}>
                          (filtered by selected product)
                          <button 
                            type="button" 
                            onClick={() => setSelectedHistoryDetailId(null)}
                            style={{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Show all
                          </button>
                        </span>
                      )}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Recent Work Activities using products from this PO</p>
                  </div>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsExpandHistoryOpen(true)}>
                    <Maximize2 size={16}/> Expand
                  </button>
                </div>
                <div className="table-container large-table" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Ordered By</th>
                        <th>Address</th>
                        <th style={{ textAlign: 'center' }}>Qty Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemHistory.length === 0 && <tr><td colSpan={5} className="empty-state">No installation history for this PO yet.</td></tr>}
                      {itemHistory.slice(0, 3).map((h, i) => (
                        <tr key={i}>
                          <td data-label="Date">{formatDateDisplay(h.date)}</td>
                          <td data-label="Product" style={{ fontWeight: 'bold' }}>{h.itemName || '-'}</td>
                          <td data-label="Ordered By" style={{ fontWeight: 'bold' }}>{h.jobOrder}</td>
                          <td data-label="Address">{h.destination}</td>
                          <td data-label="Qty Used" style={{ textAlign: 'center', fontWeight: 'bold', color: '#ef4444' }}>-{h.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History expand modal */}
      {isExpandHistoryOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1200 }}>
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>Installation History: <span style={{ color: 'var(--primary-color)' }}>{formData.po}</span></h3>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <SearchBar value={historySearchTerm} onChange={setHistorySearchTerm} />
                <button type="button" className="close-modal" onClick={() => setIsExpandHistoryOpen(false)}><X size={24}/></button>
              </div>
            </div>
            <div className="table-container large-table" style={{ marginTop: '15px', maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Ordered By</th>
                    <th>Address</th>
                    <th style={{ textAlign: 'center' }}>Qty Used</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 && <tr><td colSpan={5} className="empty-state">No records found matching your search.</td></tr>}
                  {filteredHistory.map((h, i) => (
                    <tr key={i}>
                      <td data-label="Date">{formatDateDisplay(h.date)}</td>
                      <td data-label="Product" style={{ fontWeight: 'bold' }}>{h.itemName || '-'}</td>
                      <td data-label="Ordered By" style={{ fontWeight: 'bold' }}>{h.jobOrder}</td>
                      <td data-label="Address">{h.destination}</td>
                      <td data-label="Qty Used" style={{ textAlign: 'center', fontWeight: 'bold', color: '#ef4444' }}>-{h.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};