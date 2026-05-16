import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { PackageSearch, Plus, X, Settings, Edit2, Trash2, Maximize2, Lock } from 'lucide-react';
import { ItemEntranceRecord, JobProduct, JobOrder, ItemEntranceFormData, Role } from '../types';
import { SearchBar, SeqBadge, SearchableSelect } from '../components/SharedUI';
import { useCatalogOptions, useFormConfig } from '../hooks/useAppHooks';
import { getTodayString, formatDateDisplay, getInventoryStatusStyles } from '../utils/helpers';
import { AuditLogger } from '../utils/logger';
import { useAuth, RequirePermission } from '../hooks/useAuth';

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
  
  const supplyCompanies = useCatalogOptions('supply_companies', 'company');
  const catalogItemNames = useCatalogOptions('catalog_item_names', 'item_name', 'item_name');

  const entranceFields = [
    { name: 'date', label: 'Date (Registration)' },
    { name: 'itemName', label: 'Item Name' },
    { name: 'modelPart', label: 'Model / Part #' },
    { name: 'serial', label: 'Serial #' },
    { name: 'po', label: 'PO #' },
    { name: 'supplyCompany', label: 'Supply Company' },
    { name: 'orderDate', label: 'Arrived Date' },
    { name: 'itemsArrived', label: 'Items Arrived (Initial Total)' }
  ];
  
  const { toggleRequired, isRequired } = useFormConfig('itemEntrance', ['date', 'itemName', 'supplyCompany', 'itemsArrived']);

  const [fieldRoles, setFieldRoles] = useState<Record<string, string>>({});

  // 🔥 SOLUCIÓN TS: quantityOrdered en 0 "por debajo de la mesa" para que Typescript no llore
  const initialForm: ItemEntranceFormData = {
    date: getTodayString(), modelPart: '', serial: '', po: '', orderDate: '', 
    quantityOrdered: 0, itemsArrived: 0, supplyCompany: '', itemName: ''
  };
  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);

  const collectionRef = collection(db, "itemEntrance");

  const fetchItems = async () => {
    const data = await getDocs(collectionRef);
    const fetched = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    
    fetched.sort((a: any, b: any) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());
    
    const totalItems = fetched.length;
    const mapped = fetched.map((item: any, idx: number) => ({ 
      ...item, 
      visualSeq: item.seq || (totalItems - idx) 
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
    if (requiredRole && currentUser?.roleId !== requiredRole) {
      return false;
    }
    return true; 
  };

  const getStock = (itemId: string, initialArrived: number) => {
    const used = allJobProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    return initialArrived - used;
  };

  const itemHistory = allJobProducts
    .filter(p => p.itemEntranceId === editingId)
    .map(p => {
      const order = allOrders.find(o => o.id === p.jobOrderId);
      return {
        id: p.id,
        quantity: p.quantity,
        jobOrder: order?.jobOrder || 'Unknown',
        destination: order?.destination || 'Unknown',
        date: order?.createdAt || '',
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredHistory = itemHistory.filter(h => {
    const s = historySearchTerm.toLowerCase();
    return (
      h.jobOrder.toLowerCase().includes(s) || 
      h.destination.toLowerCase().includes(s) || 
      formatDateDisplay(h.date).includes(s)
    );
  });

  const handleOpenModal = (item: ItemEntranceRecord | null = null) => {
    if (item) { 
      setEditingId(item.id); 
      // 🔥 SOLUCIÓN TS: Mantenemos el quantityOrdered oculto
      setFormData({
        date: item.date || '',
        itemName: item.itemName || '',
        modelPart: item.modelPart || '',
        serial: item.serial || '',
        po: item.po || '',
        orderDate: item.orderDate || '',
        quantityOrdered: item.quantityOrdered || 0,
        itemsArrived: item.itemsArrived || 0,
        supplyCompany: item.supplyCompany || ''
      }); 
    } else { 
      setEditingId(null); 
      setFormData({ ...initialForm, date: getTodayString() }); 
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "itemEntrance", editingId), { ...formData });
        AuditLogger.logUpdate('Item Entrance', authorName, editingId, formData);
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
          ...formData, 
          seq: nextSeq, 
          createdAt: new Date().toISOString() 
        });
        AuditLogger.logCreate('Item Entrance', authorName, docRef.id, formData);
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

  const filteredItems = items.filter(item => {
    const currentStock = getStock(item.id, item.itemsArrived);
    let matchStock = true;
    if (stockFilter === 'AVAILABLE') matchStock = currentStock > 0;
    if (stockFilter === 'UNAVAILABLE') matchStock = currentStock <= 0;

    const searchLower = searchTerm.toLowerCase();
    const matchSearch = (
      String(item.itemName || '').toLowerCase().includes(searchLower) ||
      String(item.modelPart || '').toLowerCase().includes(searchLower) ||
      String(item.serial || '').toLowerCase().includes(searchLower) ||
      String(item.po || '').toLowerCase().includes(searchLower) ||
      String(item.supplyCompany || '').toLowerCase().includes(searchLower) ||
      formatDateDisplay(item.date).includes(searchLower)
    );

    return matchStock && matchSearch;
  });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><PackageSearch size={24}/> Item Entrance</h2>
          <p>Register incoming products</p>
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
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
              <th>#</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Date</th>
              <th>Item Name</th>
              <th>Model/Part #</th>
              <th>Serial #</th>
              <th>PO #</th>
              <th>Company</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && <tr><td colSpan={10} className="empty-state">No records found.</td></tr>}
            {filteredItems.map(item => {
              const currentStock = getStock(item.id, item.itemsArrived);
              const isAvailable = currentStock > 0;
              return (
                <tr key={item.id} className="clickable-row">
                  <td data-label="Actions" style={{ textAlign: 'center' }}>
                    <div className="action-btns" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
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
                  <td data-label="Item Name" style={{fontWeight: 'bold'}} onClick={() => handleOpenModal(item)}>{item.itemName}</td>
                  <td data-label="Model" onClick={() => handleOpenModal(item)}>{item.modelPart || '-'}</td>
                  <td data-label="Serial" style={{fontWeight: '600'}} onClick={() => handleOpenModal(item)}>{item.serial || '-'}</td>
                  <td data-label="PO" style={{fontWeight: '600'}} onClick={() => handleOpenModal(item)}>{item.po || '-'}</td>
                  <td data-label="Company" onClick={() => handleOpenModal(item)}>{item.supplyCompany || '-'}</td>
                  <td data-label="Stock" style={{ color: isAvailable ? 'inherit' : '#ef4444', fontWeight: isAvailable ? 'normal' : 'bold' }} onClick={() => handleOpenModal(item)}>
                    {currentStock} / {item.itemsArrived}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                            checked={isRequired(f.name)} 
                            onChange={() => toggleRequired(f.name)} 
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
            </div>
            <div className="btn-container" style={{ marginTop: '20px' }}>
              <button type="button" className="action btn-primary" onClick={() => setIsConfigOpen(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}

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
              <div className="form-grid">
                <div className="form-group">
                  <label>Date (Registration) {isRequired('date') && '*'} {!isFieldEditable('date') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required={isRequired('date')} disabled={!isFieldEditable('date')} style={{ backgroundColor: !isFieldEditable('date') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('date') ? 'not-allowed' : 'text' }}/>
                </div>
                
                <div className="form-group">
                  <label>Item Name {isRequired('itemName') && '*'} {!isFieldEditable('itemName') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <div style={{ pointerEvents: !isFieldEditable('itemName') ? 'none' : 'auto', opacity: !isFieldEditable('itemName') ? 0.6 : 1 }}>
                    <SearchableSelect 
                      options={catalogItemNames.map(c => ({ id: String(c.label), label: String(c.label) }))}
                      value={formData.itemName} 
                      onChange={(val) => setFormData({...formData, itemName: val})} 
                      placeholder="-- Search from Catalog --"
                      required={isRequired('itemName')}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Model / Part # {isRequired('modelPart') && '*'} {!isFieldEditable('modelPart') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="text" value={formData.modelPart} onChange={e => setFormData({...formData, modelPart: e.target.value})} required={isRequired('modelPart')} disabled={!isFieldEditable('modelPart')} style={{ backgroundColor: !isFieldEditable('modelPart') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('modelPart') ? 'not-allowed' : 'text' }}/>
                </div>
                <div className="form-group">
                  <label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Serial # {isRequired('serial') && '*'} {!isFieldEditable('serial') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="text" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} required={isRequired('serial')} disabled={!isFieldEditable('serial')} style={{ backgroundColor: !isFieldEditable('serial') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('serial') ? 'not-allowed' : 'text' }}/>
                </div>
                <div className="form-group">
                  <label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>PO # {isRequired('po') && '*'} {!isFieldEditable('po') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="text" value={formData.po} onChange={e => setFormData({...formData, po: e.target.value})} required={isRequired('po')} disabled={!isFieldEditable('po')} style={{ backgroundColor: !isFieldEditable('po') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('po') ? 'not-allowed' : 'text' }}/>
                </div>
                <div className="form-group">
                  <label>Supply Company {isRequired('supplyCompany') && '*'} {!isFieldEditable('supplyCompany') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <div style={{ pointerEvents: !isFieldEditable('supplyCompany') ? 'none' : 'auto', opacity: !isFieldEditable('supplyCompany') ? 0.6 : 1 }}>
                    <SearchableSelect 
                      options={supplyCompanies.map(c => ({ id: String(c.label), label: String(c.label) }))}
                      value={formData.supplyCompany} 
                      onChange={(id) => setFormData({...formData, supplyCompany: id})} 
                      placeholder="-- Select Company --"
                      required={isRequired('supplyCompany')}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Arrived Date {isRequired('orderDate') && '*'} {!isFieldEditable('orderDate') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="date" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})} required={isRequired('orderDate')} disabled={!isFieldEditable('orderDate')} style={{ backgroundColor: !isFieldEditable('orderDate') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('orderDate') ? 'not-allowed' : 'text' }}/>
                </div>

                <div className="form-group">
                  <label>Items Arrived (Initial Total) {isRequired('itemsArrived') && '*'} {!isFieldEditable('itemsArrived') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="number" value={formData.itemsArrived} onChange={e => setFormData({...formData, itemsArrived: Number(e.target.value)})} required={isRequired('itemsArrived')} disabled={!isFieldEditable('itemsArrived')} style={{ backgroundColor: !isFieldEditable('itemsArrived') ? '#f1f5f9' : 'white', cursor: !isFieldEditable('itemsArrived') ? 'not-allowed' : 'text' }}/>
                </div>
              </div>
            </form>

            {editingId && (
              <div className="products-section" style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <div className="products-header">
                  <div>
                    <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Installation History</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Recent Work Activities using this item</p>
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
                        <th>Ordered By</th>
                        <th>Address</th>
                        <th style={{ textAlign: 'center' }}>Qty Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemHistory.length === 0 && <tr><td colSpan={4} className="empty-state">No installation history for this item yet.</td></tr>}
                      {itemHistory.slice(0, 3).map((h, i) => (
                        <tr key={i}>
                          <td data-label="Date">{formatDateDisplay(h.date)}</td>
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

      {isExpandHistoryOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1200 }}>
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>Installation History: <span style={{ color: 'var(--primary-color)' }}>{formData.itemName}</span></h3>
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
                    <th>Ordered By</th>
                    <th>Address</th>
                    <th style={{ textAlign: 'center' }}>Qty Used</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 && <tr><td colSpan={4} className="empty-state">No records found matching your search.</td></tr>}
                  {filteredHistory.map((h, i) => (
                    <tr key={i}>
                      <td data-label="Date">{formatDateDisplay(h.date)}</td>
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