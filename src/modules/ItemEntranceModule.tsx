import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase'; 
import { PackageSearch, Plus, X, Settings, Edit2, Trash2, Maximize2 } from 'lucide-react';
import { ItemEntranceRecord, JobProduct, JobOrder, ItemEntranceFormData } from '../types';
import { SearchBar, FieldConfigModal, SeqBadge } from '../components/SharedUI';
import { useCatalogOptions, useFormConfig } from '../hooks/useAppHooks';
import { getTodayString, formatDateDisplay, getInventoryStatusStyles } from '../utils/helpers';

export const ItemEntrance: React.FC = () => {
  const [items, setItems] = useState<ItemEntranceRecord[]>([]);
  const [allJobProducts, setAllJobProducts] = useState<JobProduct[]>([]);
  const [allOrders, setAllOrders] = useState<JobOrder[]>([]); 
  
  const [searchTerm, setSearchTerm] = useState(''); 
  const [stockFilter, setStockFilter] = useState<'ALL' | 'AVAILABLE' | 'UNAVAILABLE'>('ALL'); 
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isExpandHistoryOpen, setIsExpandHistoryOpen] = useState<boolean>(false);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const supplyCompanies = useCatalogOptions('supply_companies', 'company');

  const entranceFields = [
    { name: 'date', label: 'Date (Registration)' },
    { name: 'itemName', label: 'Item Name' },
    { name: 'modelPart', label: 'Model / Part #' },
    { name: 'serial', label: 'Serial #' },
    { name: 'po', label: 'PO #' },
    { name: 'supplyCompany', label: 'Supply Company' },
    { name: 'orderDate', label: 'Order Date' },
    { name: 'quantityOrdered', label: 'Quantity Ordered' },
    { name: 'itemsArrived', label: 'Items Arrived' }
  ];
  const { requiredFields, toggleRequired, isRequired } = useFormConfig('itemEntrance', ['date', 'itemName', 'supplyCompany', 'quantityOrdered']);

  const initialForm: ItemEntranceFormData = {
    date: getTodayString(), modelPart: '', serial: '', po: '', orderDate: '', 
    quantityOrdered: 0, itemsArrived: 0, supplyCompany: '', itemName: ''
  };
  const [formData, setFormData] = useState<ItemEntranceFormData>(initialForm);

  const collectionRef = collection(db, "itemEntrance");

  const fetchItems = async () => {
    const data = await getDocs(collectionRef);
    const fetched = data.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    fetched.sort((a: any, b: any) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());
    const mapped = fetched.map((item: any, idx: number) => ({ ...item, visualSeq: item.seq || (idx + 1) }));
    mapped.reverse(); 
    setItems(mapped as ItemEntranceRecord[]);

    const prodData = await getDocs(collection(db, "jobProducts"));
    setAllJobProducts(prodData.docs.map(doc => ({ ...doc.data(), id: doc.id }) as JobProduct));
    
    const ordersData = await getDocs(collection(db, "jobOrders"));
    setAllOrders(ordersData.docs.map(doc => ({ ...doc.data(), id: doc.id }) as JobOrder));
  };

  useEffect(() => { fetchItems(); }, []);

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
      setFormData(item); 
    } else { 
      setEditingId(null); 
      setFormData({ ...initialForm, date: getTodayString() }); 
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, "itemEntrance", editingId), { ...formData });
      } else {
        const nextSeq = items.length > 0 ? Math.max(...items.map(i => i.visualSeq || 0)) + 1 : 1;
        await addDoc(collectionRef, { ...formData, seq: nextSeq, createdAt: new Date().toISOString() });
      }
      fetchItems();
      setIsModalOpen(false);
    } catch (error) { console.error("Error saving data", error); }
  };

  const handleDeleteEntrance = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this entrance record permanently?")) {
      await deleteDoc(doc(db, "itemEntrance", id));
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
          <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
            <Plus size={18}/> New Entrance
          </button>
        </div>
      </div>
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Date</th>
              <th>Item Name</th>
              <th>Model/Part #</th>
              <th>Serial #</th>
              <th>PO #</th>
              <th>Company</th>
              <th>Qty</th>
              <th>Stock</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && <tr><td colSpan={11} className="empty-state">No records found.</td></tr>}
            {filteredItems.map(item => {
              const currentStock = getStock(item.id, item.itemsArrived);
              const isAvailable = currentStock > 0;
              return (
                <tr key={item.id} className="clickable-row">
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
                  <td data-label="Qty" onClick={() => handleOpenModal(item)}>{item.quantityOrdered}</td>
                  <td data-label="Stock" style={{ color: isAvailable ? 'inherit' : '#ef4444', fontWeight: isAvailable ? 'normal' : 'bold' }} onClick={() => handleOpenModal(item)}>
                    {currentStock}
                  </td>
                  <td data-label="Actions" style={{ textAlign: 'center' }}>
                    <div className="action-btns">
                      <button className="icon-btn edit" onClick={() => handleOpenModal(item)}><Edit2 size={16}/></button>
                      <button className="icon-btn delete" onClick={() => handleDeleteEntrance(item.id)}><Trash2 size={16}/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FieldConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} fields={entranceFields} requiredFields={requiredFields} toggleRequired={toggleRequired} />

      {isModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <form onSubmit={handleSave}>
              <div className="modal-header">
                <h3>{editingId ? "Edit Entrance" : "New Entrance"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="icon-btn" onClick={() => setIsConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary">Save Changes</button>
                  <button type="button" className="action btn-danger" onClick={async () => {
                    if (editingId && window.confirm("Delete this record permanently?")) {
                      await deleteDoc(doc(db, "itemEntrance", editingId));
                      setIsModalOpen(false);
                      fetchItems();
                    }
                  }}><Trash2 size={16}/> Delete</button>
                  <button type="button" className="close-modal" onClick={() => setIsModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Date (Registration) {isRequired('date') && '*'}</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required={isRequired('date')} /></div>
                <div className="form-group"><label>Item Name {isRequired('itemName') && '*'}</label><input type="text" value={formData.itemName} onChange={e => setFormData({...formData, itemName: e.target.value})} required={isRequired('itemName')} /></div>
                <div className="form-group"><label>Model / Part # {isRequired('modelPart') && '*'}</label><input type="text" value={formData.modelPart} onChange={e => setFormData({...formData, modelPart: e.target.value})} required={isRequired('modelPart')} /></div>
                <div className="form-group"><label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>Serial # {isRequired('serial') && '*'}</label><input type="text" value={formData.serial} onChange={e => setFormData({...formData, serial: e.target.value})} required={isRequired('serial')} /></div>
                <div className="form-group"><label style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>PO # {isRequired('po') && '*'}</label><input type="text" value={formData.po} onChange={e => setFormData({...formData, po: e.target.value})} required={isRequired('po')} /></div>
                <div className="form-group">
                  <label>Supply Company {isRequired('supplyCompany') && '*'}</label>
                  <select value={formData.supplyCompany} onChange={e => setFormData({...formData, supplyCompany: e.target.value})} required={isRequired('supplyCompany')}>
                    <option value="">-- Select Company --</option>
                    {supplyCompanies.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Order Date {isRequired('orderDate') && '*'}</label><input type="date" value={formData.orderDate} onChange={e => setFormData({...formData, orderDate: e.target.value})} required={isRequired('orderDate')} /></div>
                <div className="form-group"><label>Quantity Ordered {isRequired('quantityOrdered') && '*'}</label><input type="number" value={formData.quantityOrdered} onChange={e => setFormData({...formData, quantityOrdered: Number(e.target.value)})} required={isRequired('quantityOrdered')} /></div>
                <div className="form-group"><label>Items Arrived (Initial Total)</label><input type="number" value={formData.itemsArrived} onChange={e => setFormData({...formData, itemsArrived: Number(e.target.value)})} /></div>
              </div>
            </form>

            {/* SECCIÓN DE HISTORIAL DE INSTALACIONES */}
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
                        <th>Destination</th>
                        <th style={{ textAlign: 'center' }}>Qty Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemHistory.length === 0 && <tr><td colSpan={4} className="empty-state">No installation history for this item yet.</td></tr>}
                      {itemHistory.slice(0, 3).map((h, i) => (
                        <tr key={i}>
                          <td data-label="Date">{formatDateDisplay(h.date)}</td>
                          <td data-label="Ordered By" style={{ fontWeight: 'bold' }}>{h.jobOrder}</td>
                          <td data-label="Destination">{h.destination}</td>
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

      {/* MODAL EXPANDIDO DEL HISTORIAL */}
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
                    <th>Destination</th>
                    <th style={{ textAlign: 'center' }}>Qty Used</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 && <tr><td colSpan={4} className="empty-state">No records found matching your search.</td></tr>}
                  {filteredHistory.map((h, i) => (
                    <tr key={i}>
                      <td data-label="Date">{formatDateDisplay(h.date)}</td>
                      <td data-label="Ordered By" style={{ fontWeight: 'bold' }}>{h.jobOrder}</td>
                      <td data-label="Destination">{h.destination}</td>
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