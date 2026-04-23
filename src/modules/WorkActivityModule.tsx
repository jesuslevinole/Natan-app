import React, { useState, useEffect } from 'react';
// 🔥 IMPORTAMOS runTransaction PARA EVITAR DUPLICADOS EN CONCURRENCIA
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, runTransaction } from 'firebase/firestore';
import { db } from '../firebase'; 
import { Briefcase, Plus, X, Settings, Edit2, Trash2 } from 'lucide-react';
import { JobOrder, JobProduct, ItemEntranceRecord, JobFormData, ProductFormData } from '../types';
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

  const [searchTerm, setSearchTerm] = useState(''); 
  const [isJobModalOpen, setIsJobModalOpen] = useState<boolean>(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState<boolean>(false);
  const [isJobConfigOpen, setIsJobConfigOpen] = useState<boolean>(false);
  const [isProductConfigOpen, setIsProductConfigOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // Estado de carga seguro

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<JobOrder | null>(null);
  const [viewProducts, setViewProducts] = useState<JobProduct[]>([]);
  const [showHistoric, setShowHistoric] = useState<boolean>(false); 

  const jobFields = [
    { name: 'createdAt', label: 'Registration Date' },
    { name: 'destination', label: 'Address' },
    { name: 'jobOrder', label: 'Ordered by' },
    { name: 'workFinish', label: 'Work Finish' },
    { name: 'description', label: 'Description' },
    { name: 'pendingWork', label: 'Pending Work' },
    { name: 'schedule', label: 'Schedule' }
  ];
  const { requiredFields: reqJob, toggleRequired: toggleJobReq, isRequired: isJobReq } = useFormConfig('jobOrder', ['createdAt', 'destination', 'jobOrder', 'workFinish']);

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
      
      // 🔥 CORRECCIÓN 1: Ordenamiento descendente ESTRICTO (El más nuevo arriba)
      fetchedOrders.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      
      const totalOrders = fetchedOrders.length;
      // Inyectamos el visualSeq basado en el orden para mantener compatibilidad con data vieja
      const mappedOrders = fetchedOrders.map((o: any, idx: number) => ({ 
        ...o, 
        visualSeq: o.seq || (totalOrders - idx) 
      }));
      
      setOrders(mappedOrders as JobOrder[]);

      const entranceData = await getDocs(entranceCollectionRef);
      setEntranceList(entranceData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as ItemEntranceRecord[]);

      const productsData = await getDocs(productsCollectionRef);
      setAllJobProducts(productsData.docs.map(doc => ({ ...doc.data(), id: doc.id })) as JobProduct[]);
    } catch (error) { console.error("Error", error); }
  };

  useEffect(() => { fetchData(); }, []);

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
    setIsProcessing(true); // Bloqueamos el botón para evitar doble click
    try {
      let savedJobId = editingJob;
      
      if (editingJob) {
        // MODO EDICIÓN
        await updateDoc(doc(db, "jobOrders", editingJob), { ...formData });
        AuditLogger.logUpdate('WorkActivity', authorName, editingJob, formData);
      } else {
        // 🔥 CORRECCIÓN 2: MODO CREACIÓN CON TRANSACCIÓN ATÓMICA (Cero duplicados de Consecutivo)
        const counterRef = doc(db, 'counters', 'jobOrdersSeq');
        
        const nextSeq = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let newSeq = 1; // Si es el primer registro de la historia
          
          if (counterDoc.exists()) {
            newSeq = (counterDoc.data().value || 0) + 1;
            transaction.update(counterRef, { value: newSeq });
          } else {
            transaction.set(counterRef, { value: 1 });
          }
          return newSeq;
        });

        // Guardamos con el consecutivo asegurado por el servidor
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

      <FieldConfigModal isOpen={isJobConfigOpen} onClose={() => setIsJobConfigOpen(false)} fields={jobFields} requiredFields={reqJob} toggleRequired={toggleJobReq} />
      <FieldConfigModal isOpen={isProductConfigOpen} onClose={() => setIsProductConfigOpen(false)} fields={productFields} requiredFields={reqProd} toggleRequired={toggleProdReq} />

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
                  <button type="button" className="icon-btn" onClick={() => setIsJobConfigOpen(true)} title="Configure Required Fields"><Settings size={20}/></button>
                  <button type="submit" className="action btn-primary" disabled={isProcessing}>
                    {isProcessing ? 'Saving...' : 'Save Order'}
                  </button>
                  <button type="button" className="close-modal" onClick={() => setIsJobModalOpen(false)}><X size={24}/></button>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group"><label>Registration Date {isJobReq('createdAt') && '*'}</label><input type="date" value={formData.createdAt} onChange={e => setFormData({...formData, createdAt: e.target.value})} required={isJobReq('createdAt')} disabled={isProcessing}/></div>
                
                <div className="form-group">
                  <label>Address {isJobReq('destination') && '*'}</label>
                  <DestinationSearch 
                    value={formData.destination}
                    onSelect={(val) => setFormData({...formData, destination: val})}
                    placeholder="Search address..."
                    required={isJobReq('destination')}
                  />
                </div>

                <div className="form-group">
                  <label>Ordered by {isJobReq('jobOrder') && '*'}</label>
                  <input 
                    type="text" 
                    value={formData.jobOrder} 
                    readOnly 
                    title="This field is auto-populated and cannot be changed for auditing purposes."
                    style={{
                      backgroundColor: '#f1f5f9',
                      color: '#64748b',
                      cursor: 'not-allowed',
                      fontWeight: '600',
                      border: '1px solid #cbd5e1'
                    }}
                  />
                </div>

                <div className="form-group"><label>Work Finish {isJobReq('workFinish') && '*'}</label><select value={formData.workFinish} onChange={e => setFormData({...formData, workFinish: e.target.value as 'YES' | 'NO'})} required={isJobReq('workFinish')} disabled={isProcessing}><option value="YES">YES</option><option value="NO">NO</option></select></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label>Description {isJobReq('description') && '*'}</label><input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required={isJobReq('description')} disabled={isProcessing}/></div>
                <div className="form-group"><label>Schedule {isJobReq('schedule') && '*'}</label><input type="date" value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} required={isJobReq('schedule')} disabled={isProcessing}/></div>
                <div className="form-group"><label>Pending Work {isJobReq('pendingWork') && '*'}</label><input type="text" value={formData.pendingWork} onChange={e => setFormData({...formData, pendingWork: e.target.value})} required={isJobReq('pendingWork')} disabled={isProcessing}/></div>
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