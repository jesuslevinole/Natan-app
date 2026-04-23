import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Briefcase, Plus, X, Settings, Edit2, Trash2, Lock } from 'lucide-react';
import { JobOrder, JobProduct, ItemEntranceRecord, JobFormData, ProductFormData, Role } from '../types';
import { SearchBar, FieldConfigModal, SeqBadge, SearchableSelect, DestinationSearch } from '../components/SharedUI';
import { useFormConfig } from '../hooks/useAppHooks';
import { getTodayString, formatDateDisplay, getStatusStyles, formatSeq } from '../utils/helpers';
import { AuditLogger } from '../utils/logger';
import { useAuth, RequirePermission } from '../hooks/useAuth';

export const WorkActivity: React.FC = () => {
  const { currentUser } = useAuth();
  
  const authorName = currentUser 
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.username 
    : 'Unknown User';
  
  const [orders, setOrders] = useState<JobOrder[]>([]);
  const [entranceList, setEntranceList] = useState<ItemEntranceRecord[]>([]); 
  const [allJobProducts, setAllJobProducts] = useState<JobProduct[]>([]);
  const [systemRoles, setSystemRoles] = useState<Role[]>([]); 

  const [searchTerm, setSearchTerm] = useState(''); 
  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [isJobConfigOpen, setIsJobConfigOpen] = useState<boolean>(false);
  const [isProductConfigOpen, setIsProductConfigOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<JobOrder | null>(null);
  const [viewProducts, setViewProducts] = useState<JobProduct[]>([]);
  const [showHistoric, setShowHistoric] = useState<boolean>(false); 
  const [isQuickDestOpen, setIsQuickDestOpen] = useState<boolean>(false);
  const [newDestData, setNewDestData] = useState({ property_name: '', description: '', contact: '' });

  const jobFields = [
    { name: 'createdAt', label: 'Registration Date' },
    { name: 'destination', label: 'Address' },
    { name: 'jobOrder', label: 'Ordered by' },
    { name: 'workFinish', label: 'Work Finish' },
    { name: 'description', label: 'Description' },
    { name: 'pendingWork', label: 'Pending Work' },
    { name: 'schedule', label: 'Schedule' }
  ];
  
  // 🔥 CORRECCIÓN: Se eliminó 'requiredFields: reqJob' ya que no se utiliza en el nuevo modal avanzado
  const { toggleRequired: toggleJobReq, isRequired: isJobReq } = useFormConfig('jobOrder', ['createdAt', 'destination', 'jobOrder', 'workFinish']);
  
  const [jobFieldRoles, setJobFieldRoles] = useState<Record<string, string>>({});

  const productFields = [
    { name: 'itemEntranceId', label: 'Select Item' },
    { name: 'quantity', label: 'Quantity' }
  ];
  const { requiredFields: reqProd, toggleRequired: toggleProdReq, isRequired: isProdReq } = useFormConfig('addProduct', ['itemEntranceId', 'quantity']);

  const initialFormState: JobFormData = {
    jobOrder: authorName, 
    destination: '', 
    description: '', 
    workFinish: 'NO', 
    pendingWork: '', 
    schedule: '', 
    createdAt: getTodayString()
  };
  
  const [formData, setFormData] = useState<JobFormData>(initialFormState);
  const [formProducts, setFormProducts] = useState<JobProduct[]>([]);
  
  const [currentProduct, setCurrentProduct] = useState<ProductFormData>({
    itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: ''
  });

  const ordersCollectionRef = collection(db, "jobOrders");
  const productsCollectionRef = collection(db, "jobProducts");
  const entranceCollectionRef = collection(db, "itemEntrance"); 

  const fetchData = async () => {
    try {
      const orderData = await getDocs(ordersCollectionRef);
      const fetchedOrders = orderData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as any));
      
      fetchedOrders.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      const totalOrders = fetchedOrders.length;
      const mappedOrders = fetchedOrders.map((o: any, idx: number) => ({ 
        ...o, 
        visualSeq: o.seq || (totalOrders - idx) 
      }));
      
      setOrders(mappedOrders as JobOrder[]);

      const entranceData = await getDocs(entranceCollectionRef);
      setEntranceList(entranceData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ItemEntranceRecord[]);

      const productsData = await getDocs(productsCollectionRef);
      setAllJobProducts(productsData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);

      const rolesSnap = await getDocs(collection(db, 'roles'));
      setSystemRoles(rolesSnap.docs.map(d => ({id: d.id, ...d.data()} as Role)));

    } catch (error) { console.error("Error", error); }
  };

  useEffect(() => { 
    fetchData(); 
    const savedJobFieldRoles = localStorage.getItem('workActivity_jobFieldRoles');
    if (savedJobFieldRoles) setJobFieldRoles(JSON.parse(savedJobFieldRoles));
  }, []);

  const isJobFieldEditable = (fieldName: string) => {
    if (isProcessing) return false;
    if (currentUser?.roleId === 'admin_role') return true; 

    const requiredRole = jobFieldRoles[fieldName];
    if (requiredRole && currentUser?.roleId !== requiredRole) {
      return false;
    }
    return true; 
  };

  const getAvailableStock = (itemId: string) => {
    const item = entranceList.find(i => i.id === itemId);
    if (!item) return 0;
    const usedInDB = allJobProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    const usedInForm = formProducts.filter(p => p.itemEntranceId === itemId).reduce((acc, p) => acc + p.quantity, 0);
    return item.itemsArrived - usedInDB - usedInForm;
  };

  const handleViewDetails = async (job: JobOrder) => {
    setViewingJob(job);
    try {
      const q = query(productsCollectionRef, where("jobOrderId", "==", job.id));
      const querySnapshot = await getDocs(q);
      setViewProducts(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } catch (error) { console.error("Error", error); }
  };

  const handleOpenModal = async (job: JobOrder | null = null) => {
    setViewingJob(null); 
    if (job) {
      setEditingJob(job.id);
      setFormData({ 
        jobOrder: job.jobOrder, 
        destination: job.destination, 
        description: job.description, 
        workFinish: job.workFinish, 
        pendingWork: job.pendingWork, 
        schedule: job.schedule,
        createdAt: job.createdAt || getTodayString()
      });
      const q = query(productsCollectionRef, where("jobOrderId", "==", job.id));
      const querySnapshot = await getDocs(q);
      setFormProducts(querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } else {
      setEditingJob(null);
      setFormData({ ...initialFormState, jobOrder: authorName, createdAt: getTodayString() });
      setFormProducts([]);
    }
    setIsJobModalOpen(true);
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm("⚠️ Delete record?")) {
      const orderToDelete = orders.find(o => o.id === id);
      await deleteDoc(doc(db, "jobOrders", id));
      AuditLogger.logDelete('WorkActivity', authorName, id, orderToDelete);
      setViewingJob(null);
      fetchData(); 
    }
  };

  const handleSaveOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      let savedJobId = editingJob;
      
      if (editingJob) {
        await updateDoc(doc(db, "jobOrders", editingJob), { ...formData });
        AuditLogger.logUpdate('WorkActivity', authorName, editingJob, formData);
      } else {
        const counterRef = doc(db, 'counters', 'jobOrdersSeq');
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

        const docRef = await addDoc(ordersCollectionRef, { 
          ...formData, 
          createdBy: authorName, 
          seq: nextSeq 
        });
        savedJobId = docRef.id;
        AuditLogger.logCreate('WorkActivity', authorName, docRef.id, formData);
      }
      
      for (const product of formProducts) {
        if (!product.id && savedJobId) await addDoc(productsCollectionRef, { ...product, jobOrderId: savedJobId });
      }
      
      await fetchData(); 
      setIsJobModalOpen(false);
    } catch (error) { 
      console.error("Error", error); 
      alert("Error al guardar el registro.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveQuickDestination = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const destSnap = await getDocs(collection(db, 'catalog_destinations'));
      let maxSeq = 0;
      destSnap.forEach(d => {
        const data = d.data();
        if (data.seq > maxSeq) maxSeq = data.seq;
      });

      const docRef = await addDoc(collection(db, 'catalog_destinations'), {
        ...newDestData,
        seq: maxSeq + 1,
        createdAt: new Date().toISOString()
      });
      
      AuditLogger.logCreate('Catalogs (Destinations)', authorName, docRef.id, newDestData);
      
      setFormData({ ...formData, destination: newDestData.property_name });
      setIsQuickDestOpen(false);
      setNewDestData({ property_name: '', description: '', contact: '' });
    } catch (error) {
      console.error("Error adding quick destination", error);
      alert("Error adding destination");
    }
  };

  const handleItemEntranceSelection = (selectedId: string) => {
    if (selectedId) {
      const item = entranceList.find(i => i.id === selectedId);
      const stock = getAvailableStock(selectedId);
      if (item) setCurrentProduct({ 
        ...currentProduct, 
        itemEntranceId: item.id, 
        itemName: item.itemName, 
        modelPart: item.modelPart, 
        serial: item.serial, 
        po: item.po,
        quantity: stock > 0 ? 1 : 0
      });
    } else setCurrentProduct({ ...currentProduct, itemEntranceId: '', itemName: '', modelPart: '', serial: '', po: '', quantity: 1 });
  };

  const handleAddProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const availableStock = getAvailableStock(currentProduct.itemEntranceId);
    if (availableStock <= 0 || currentProduct.quantity > availableStock) {
      alert("There is no stock of this product. Please update the stock.");
      return;
    }

    if (viewingJob) {
      const docRef = await addDoc(productsCollectionRef, { ...currentProduct, jobOrderId: viewingJob.id });
      setViewProducts([...viewProducts, { ...currentProduct, id: docRef.id, jobOrderId: viewingJob.id }]);
      AuditLogger.logUpdate('WorkActivity Products', authorName, viewingJob.id, { addedProduct: currentProduct });
      fetchData();
    } else {
      setFormProducts([...formProducts, { ...currentProduct, jobOrderId: 'pending' }]); 
    }
    setCurrentProduct({ itemEntranceId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '' });
    setIsProductModalOpen(false);
  };

  const handleRemoveProductFromDetails = async (productId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if(window.confirm("Delete product?")) {
      const prodToDelete = viewProducts.find(p => p.id === productId);
      await deleteDoc(doc(db, "jobProducts", productId));
      
      if (viewingJob) {
        AuditLogger.logUpdate('WorkActivity Products', authorName, viewingJob.id, { removedProduct: prodToDelete });
      }
      
      setViewProducts(viewProducts.filter(p => p.id !== productId));
      fetchData(); 
    }
  };

  const handleRemoveProductFromForm = (index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFormProducts(formProducts.filter((_, i) => i !== index));
  };

  const displayedOrders = (showHistoric 
    ? orders.filter(o => o.workFinish === 'YES') 
    : orders.filter(o => o.workFinish === 'NO')
  ).filter(order => {
    const searchLower = searchTerm.toLowerCase();
    return (
      String(order.jobOrder || '').toLowerCase().includes(searchLower) ||
      String(order.destination || '').toLowerCase().includes(searchLower) ||
      String(order.description || '').toLowerCase().includes(searchLower) ||
      String(order.pendingWork || '').toLowerCase().includes(searchLower) ||
      formatDateDisplay(order.createdAt).includes(searchLower) ||
      formatDateDisplay(order.schedule).includes(searchLower)
    );
  });

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="card-header-text" style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Briefcase size={24}/> {showHistoric ? 'Historic Records' : 'Work Activity'}
          </h2>
          <p>{showHistoric ? 'Completed orders' : 'Active job orders'}</p>
        </div>
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', minWidth: '250px' }}>
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: '200px' }}>
          <button className="action btn-primary" style={{ backgroundColor: showHistoric ? '#64748b' : 'var(--primary-color)', height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => setShowHistoric(!showHistoric)}>
            {showHistoric ? 'View Active' : 'Record'}
          </button>
          
          <RequirePermission permission="add_work_activity">
            {!showHistoric && (
              <button className="action btn-primary" style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }} onClick={() => handleOpenModal(null)}>
                <Plus size={18}/> New Order
              </button>
            )}
          </RequirePermission>
        </div>
      </div>
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center', width: '100px' }}>Actions</th>
              <th>#</th>
              <th>Registration Date</th>
              <th>Ordered by</th>
              <th>Address</th>
              <th>Description</th>
              <th style={{ textAlign: 'center' }}>Work Finish</th>
              <th>Pending Work</th>
              <th>Schedule</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.length === 0 && <tr><td colSpan={9} className="empty-state">No records found.</td></tr>}
            {displayedOrders.map(order => {
              return (
                <tr key={order.id} className="clickable-row" onClick={() => handleViewDetails(order)}>
                  <td data-label="Actions" style={{ textAlign: 'center' }}>
                    <div className="action-btns" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <RequirePermission permission="edit_work_activity">
                        <button 
                          type="button" 
                          className="icon-btn edit" 
                          onClick={(e) => { e.stopPropagation(); handleOpenModal(order); }} 
                          title="Edit Order"
                        >
                          <Edit2 size={16}/>
                        </button>
                      </RequirePermission>
                      <RequirePermission permission="delete_work_activity">
                        <button 
                          type="button" 
                          className="icon-btn delete" 
                          onClick={(e) => { e.stopPropagation(); handleDelete(order.id, e); }} 
                          title="Delete Order"
                        >
                          <Trash2 size={16}/>
                        </button>
                      </RequirePermission>
                    </div>
                  </td>
                  <td data-label="#"><SeqBadge seq={order.visualSeq} /></td>
                  <td data-label="Date">{formatDateDisplay(order.createdAt)}</td>
                  <td data-label="Ordered by" style={{ fontWeight: 'bold' }}>{order.jobOrder}</td>
                  <td data-label="Address">{order.destination}</td>
                  <td data-label="Description">{order.description}</td>
                  <td data-label="Status" style={{ textAlign: 'center' }}><span style={getStatusStyles(order.workFinish)}>{order.workFinish}</span></td>
                  <td data-label="Pending Work">{order.pendingWork || '-'}</td>
                  <td data-label="Schedule">{formatDateDisplay(order.schedule)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <FieldConfigModal isOpen={isProductConfigOpen} onClose={() => setIsProductConfigOpen(false)} fields={productFields} requiredFields={reqProd} toggleRequired={toggleProdReq} />

      {isJobConfigOpen && (
        <div className="modal-overlay active" style={{ zIndex: 2000 }}>
          <div className="modal-content modal-large" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={20}/> Form Security & Fields</h3>
              <button type="button" className="close-modal" onClick={() => setIsJobConfigOpen(false)}><X size={24}/></button>
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
                    {jobFields.map(f => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 'bold', color: '#334155' }}>{f.label}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isJobReq(f.name)} 
                            onChange={() => toggleJobReq(f.name)} 
                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td>
                          <select 
                            value={jobFieldRoles[f.name] || ''} 
                            onChange={e => {
                              const updated = { ...jobFieldRoles, [f.name]: e.target.value };
                              if (!e.target.value) delete updated[f.name];
                              setJobFieldRoles(updated);
                              localStorage.setItem('workActivity_jobFieldRoles', JSON.stringify(updated));
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
              <button type="button" className="action btn-primary" onClick={() => setIsJobConfigOpen(false)} style={{ width: '100%' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {viewingJob && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SeqBadge seq={viewingJob.visualSeq} /> Order Details
              </h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <RequirePermission permission="edit_work_activity">
                  <button className="action btn-primary" onClick={() => handleOpenModal(viewingJob)}><Edit2 size={16}/> Edit</button>
                </RequirePermission>
                <RequirePermission permission="delete_work_activity">
                  <button className="action btn-danger" onClick={(e) => handleDelete(viewingJob.id, e)}><Trash2 size={16}/> Delete</button>
                </RequirePermission>
                <button className="close-modal" onClick={() => setViewingJob(null)}><X size={24}/></button>
              </div>
            </div>
            
            <div className="details-grid">
              <div className="detail-item"><span>Registration Date:</span> <p>{formatDateDisplay(viewingJob.createdAt)}</p></div>
              <div className="detail-item"><span>Address:</span> <p>{viewingJob.destination}</p></div>
              <div className="detail-item"><span>Ordered by:</span> <p>{viewingJob.jobOrder}</p></div>
              <div className="detail-item"><span>Schedule:</span> <p>{formatDateDisplay(viewingJob.schedule)}</p></div>
              <div className="detail-item"><span>Status:</span> <p><span style={getStatusStyles(viewingJob.workFinish)}>{viewingJob.workFinish}</span></p></div>
              <div className="detail-item"><span>Pending Work:</span> <p>{viewingJob.pendingWork || '-'}</p></div>
              <div className="detail-item full-width"><span>Description:</span> <p>{viewingJob.description}</p></div>
            </div>
            
            <div className="products-section">
              <div className="products-header">
                <h4 style={{ margin: 0 }}>Associated Products / Materials</h4>
                <RequirePermission permission="edit_work_activity">
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16}/> Add Product</button>
                </RequirePermission>
              </div>
              <div className="table-container large-table">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', width: '80px' }}>Action</th>
                      <th>#</th>
                      <th>Item Name</th>
                      <th>Model</th>
                      <th>Serial</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewProducts.length === 0 && <tr><td colSpan={6} className="empty-state">No products attached.</td></tr>}
                    {viewProducts.map((p, i) => (
                      <tr key={p.id}>
                        <td data-label="Action" style={{ textAlign: 'center' }}>
                          <RequirePermission permission="edit_work_activity">
                            <button type="button" className="btn-text-danger" onClick={(e) => handleRemoveProductFromDetails(p.id!, e)}>Remove</button>
                          </RequirePermission>
                        </td>
                        <td data-label="#">{formatSeq(i + 1)}</td>
                        <td data-label="Item">{p.itemName}</td>
                        <td data-label="Model">{p.modelPart}</td>
                        <td data-label="Serial">{p.serial || '-'}</td>
                        <td data-label="Qty">{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {isJobModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content modal-large">
            <form onSubmit={handleSaveOrder}>
              <div className="modal-header">
                <h3>{editingJob ? "Edit Order" : "Create New Order"}</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <RequirePermission permission="manage_security">
                    <button type="button" className="icon-btn" onClick={() => setIsJobConfigOpen(true)} title="Configure Field Security"><Settings size={20}/></button>
                  </RequirePermission>
                  <button type="submit" className="action btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save Order'}
                  </button>
                  <button type="button" className="close-modal" onClick={() => setIsJobModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                
                <div className="form-group">
                  <label>Registration Date {isJobReq('createdAt') && '*'} {!isJobFieldEditable('createdAt') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="date" value={formData.createdAt} onChange={e => setFormData({...formData, createdAt: e.target.value})} required={isJobReq('createdAt')} disabled={!isJobFieldEditable('createdAt')} style={{ backgroundColor: !isJobFieldEditable('createdAt') ? '#f1f5f9' : 'white', cursor: !isJobFieldEditable('createdAt') ? 'not-allowed' : 'text' }}/>
                </div>
                
                <div className="form-group">
                  <label>Address {isJobReq('destination') && '*'} {!isJobFieldEditable('destination') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', pointerEvents: !isJobFieldEditable('destination') ? 'none' : 'auto', opacity: !isJobFieldEditable('destination') ? 0.6 : 1 }}>
                    <div style={{ flex: 1 }}>
                      <DestinationSearch 
                        value={formData.destination}
                        onSelect={(val) => setFormData({...formData, destination: val})}
                        placeholder="Search address..."
                        required={isJobReq('destination')}
                      />
                    </div>
                    <button 
                      type="button" 
                      className="action btn-secondary" 
                      style={{ padding: '0 14px', height: '46px' }}
                      onClick={() => setIsQuickDestOpen(true)}
                      title="Add New Destination"
                      disabled={!isJobFieldEditable('destination')}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ordered by {isJobReq('jobOrder') && '*'}</label>
                  <input 
                    type="text" 
                    value={formData.jobOrder} 
                    readOnly 
                    title="This field is auto-populated and cannot be changed for auditing purposes."
                    style={{ backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed', fontWeight: '600', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div className="form-group">
                  <label>Work Finish {isJobReq('workFinish') && '*'} {!isJobFieldEditable('workFinish') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <select value={formData.workFinish} onChange={e => setFormData({...formData, workFinish: e.target.value as 'YES' | 'NO'})} required={isJobReq('workFinish')} disabled={!isJobFieldEditable('workFinish')} style={{ backgroundColor: !isJobFieldEditable('workFinish') ? '#f1f5f9' : 'white', cursor: !isJobFieldEditable('workFinish') ? 'not-allowed' : 'text' }}>
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                </div>
                
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Description {isJobReq('description') && '*'} {!isJobFieldEditable('description') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required={isJobReq('description')} disabled={!isJobFieldEditable('description')} style={{ backgroundColor: !isJobFieldEditable('description') ? '#f1f5f9' : 'white', cursor: !isJobFieldEditable('description') ? 'not-allowed' : 'text' }}/>
                </div>
                
                <div className="form-group">
                  <label>Schedule {isJobReq('schedule') && '*'} {!isJobFieldEditable('schedule') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="date" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} required={isJobReq('schedule')} disabled={!isJobFieldEditable('schedule')} style={{ backgroundColor: !isJobFieldEditable('schedule') ? '#f1f5f9' : 'white', cursor: !isJobFieldEditable('schedule') ? 'not-allowed' : 'text' }}/>
                </div>
                
                <div className="form-group">
                  <label>Pending Work {isJobReq('pendingWork') && '*'} {!isJobFieldEditable('pendingWork') && <span style={{fontSize:'0.75rem', color:'#ef4444'}}><Lock size={12}/> Locked</span>}</label>
                  <input type="text" value={formData.pendingWork} onChange={e => setFormData({...formData, pendingWork: e.target.value})} required={isJobReq('pendingWork')} disabled={!isJobFieldEditable('pendingWork')} style={{ backgroundColor: !isJobFieldEditable('pendingWork') ? '#f1f5f9' : 'white', cursor: !isJobFieldEditable('pendingWork') ? 'not-allowed' : 'text' }}/>
                </div>
              </div>
              
              <div className="products-section">
                <div className="products-header">
                  <h4 style={{ margin: 0 }}>Products List</h4>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)} disabled={isProcessing}><Plus size={16}/> Add Product</button>
                </div>
                <div className="table-container large-table">
                  <table className="responsive-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'center', width: '80px' }}>Action</th>
                        <th>#</th>
                        <th>Item</th>
                        <th>Model</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formProducts.length === 0 && <tr><td colSpan={5} className="empty-state">No products added. Click "+ Add Product".</td></tr>}
                      {formProducts.map((p, index) => (
                        <tr key={index}>
                          <td data-label="Action" style={{ textAlign: 'center' }}>
                            <button type="button" className="btn-text-danger" onClick={(e) => handleRemoveProductFromForm(index, e)} disabled={isProcessing}>Remove</button>
                          </td>
                          <td data-label="#">{formatSeq(index + 1)}</td>
                          <td data-label="Item">{p.itemName}</td>
                          <td data-label="Model">{p.modelPart}</td>
                          <td data-label="Qty">{p.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQuickDestOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1300 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <form onSubmit={handleSaveQuickDestination}>
              <div className="modal-header">
                <h3>Quick Add Destination</h3>
                <button type="button" className="close-modal" onClick={() => setIsQuickDestOpen(false)}><X size={24}/></button>
              </div>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Property Name * (Ej. 260)</label>
                  <input 
                    type="text" 
                    required 
                    value={newDestData.property_name} 
                    onChange={e => setNewDestData({...newDestData, property_name: e.target.value})} 
                  />
                </div>
                <div className="form-group full-width">
                  <label>Description * (Visible Name)</label>
                  <input 
                    type="text" 
                    required 
                    value={newDestData.description} 
                    onChange={e => setNewDestData({...newDestData, description: e.target.value})} 
                  />
                </div>
                <div className="form-group full-width">
                  <label>Contact (Optional)</label>
                  <input 
                    type="text" 
                    value={newDestData.contact} 
                    onChange={e => setNewDestData({...newDestData, contact: e.target.value})} 
                  />
                </div>
              </div>
              <div className="modal-footer-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="submit" className="action btn-primary">Save Destination</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1100 }}>
          <div className="modal-content modal-large" style={{ maxWidth: '950px', width: '95%' }}>
            <form onSubmit={handleAddProductSubmit}>
              <div className="modal-header">
                <h3>Add Product</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" className="icon-btn" onClick={() => setIsProductConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary">Add to List</button>
                  <button type="button" className="close-modal" onClick={() => setIsProductModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '15px' }}>
                <div className="form-group" style={{ flex: '3 1 250px' }}>
                  <label>Select Item {isProdReq('itemEntranceId') && '*'}</label>
                  <SearchableSelect 
                    options={entranceList.map(item => {
                      const stock = getAvailableStock(item.id);
                      return {
                        id: String(item.id), 
                        label: `${item.itemName} | Model: ${item.modelPart || '-'} | Serial: ${item.serial || '-'} | PO: ${item.po || '-'} | Stock: ${stock}`
                      };
                    })}
                    value={currentProduct.itemEntranceId} 
                    onChange={(id) => handleItemEntranceSelection(id)} 
                    placeholder="-- Type name, model, serial, PO... --"
                    required={isProdReq('itemEntranceId')}
                  />
                </div>
                
                <div className="form-group" style={{ flex: '1 1 100px' }}>
                  <label>Quantity {isProdReq('quantity') && '*'}</label>
                  <input 
                    type="number" 
                    min="1" 
                    max={currentProduct.itemEntranceId ? getAvailableStock(currentProduct.itemEntranceId) : ''}
                    disabled={!currentProduct.itemEntranceId || getAvailableStock(currentProduct.itemEntranceId) <= 0}
                    value={currentProduct.quantity} 
                    onChange={e => {
                      let val = Number(e.target.value);
                      const maxStock = getAvailableStock(currentProduct.itemEntranceId);
                      if (val > maxStock) val = maxStock;
                      setCurrentProduct({...currentProduct, quantity: val});
                    }} 
                    required={isProdReq('quantity')} 
                    style={{
                      backgroundColor: (!currentProduct.itemEntranceId || getAvailableStock(currentProduct.itemEntranceId) <= 0) ? '#f1f5f9' : 'white',
                      cursor: (!currentProduct.itemEntranceId || getAvailableStock(currentProduct.itemEntranceId) <= 0) ? 'not-allowed' : 'text'
                    }}
                  />
                  {currentProduct.itemEntranceId && getAvailableStock(currentProduct.itemEntranceId) <= 0 && (
                    <span style={{color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 'bold'}}>Out of stock</span>
                  )}
                  {currentProduct.itemEntranceId && getAvailableStock(currentProduct.itemEntranceId) > 0 && (
                    <span style={{color: '#64748b', fontSize: '0.75rem', marginTop: '4px', display: 'block'}}>Max available: {getAvailableStock(currentProduct.itemEntranceId)}</span>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};