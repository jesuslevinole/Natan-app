import { useState, useMemo, useCallback, type FormEvent, type MouseEvent } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Briefcase, Plus, Settings, Edit2, Trash2, Lock } from 'lucide-react';
import type { JobOrder, JobProduct, JobFormData, ProductFormData, WorkFinish } from '../types';
import Modal from '../components/Modal';
import ModuleHeader from '../components/ModuleHeader';
import SeqBadge from '../components/SeqBadge';
import SearchableSelect from '../components/SearchableSelect';
import DestinationSearch from '../components/DestinationSearch';
import FieldSecurityModal from '../components/FieldSecurityModal';
import LoadingScreen from '../components/LoadingScreen';
import { WorkFinishBadge } from '../components/StatusBadge';
import { useFormConfig, useFieldRoles } from '../hooks/useAppHooks';
import { useAppData } from '../hooks/useAppData';
import { getTodayString, formatDateDisplay, formatSeq, displayName, matchesSearch } from '../utils/helpers';
import { flattenEntrances } from '../utils/entrance';
import { nextSequence } from '../utils/firestore';
import { AuditLogger } from '../utils/logger';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import RequirePermission from '../components/RequirePermission';

const JOB_FIELDS = [
  { name: 'createdAt', label: 'Registration Date' },
  { name: 'destination', label: 'Address' },
  { name: 'jobOrder', label: 'Ordered by' },
  { name: 'madeBy', label: 'Made by' },
  { name: 'workFinish', label: 'Work Finish' },
  { name: 'description', label: 'Description' },
  { name: 'pendingWork', label: 'Pending Work' },
  { name: 'schedule', label: 'Schedule' },
];
const PRODUCT_FIELDS = [
  { name: 'itemEntranceId', label: 'Select Item' },
  { name: 'quantity', label: 'Quantity' },
];

const emptyProduct: ProductFormData = {
  itemEntranceId: '', entranceDetailId: '', modelPart: '', serial: '', po: '', quantity: 1, itemName: '',
};

export default function WorkActivityModule() {
  const { currentUser } = useAuth();
  const authorName = useAuthorName();
  const { jobOrders, jobProducts, entrances, usage, roles, users, isLoading } = useAppData();

  const [searchTerm, setSearchTerm] = useState('');
  const [showHistoric, setShowHistoric] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isJobConfigOpen, setIsJobConfigOpen] = useState(false);
  const [isProductConfigOpen, setIsProductConfigOpen] = useState(false);
  const [isQuickDestOpen, setIsQuickDestOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [newDestData, setNewDestData] = useState({ description: '', property: '', contact: '' });

  const { toggleRequired: toggleJobReq, isRequired: isJobReq } = useFormConfig(
    'jobOrder', ['createdAt', 'destination', 'jobOrder', 'madeBy', 'workFinish'],
  );
  const { toggleRequired: toggleProdReq, isRequired: isProdReq } = useFormConfig('addProduct', ['itemEntranceId', 'quantity']);
  const { fieldRoles, setFieldRole } = useFieldRoles('workActivity_jobFieldRoles');

  const initialFormState = useMemo<JobFormData>(() => ({
    jobOrder: authorName, madeBy: authorName, destination: '', description: '',
    workFinish: 'NO', pendingWork: '', schedule: '', createdAt: getTodayString(),
  }), [authorName]);

  const [formData, setFormData] = useState<JobFormData>(initialFormState);
  const [formProducts, setFormProducts] = useState<JobProduct[]>([]);
  const [currentProduct, setCurrentProduct] = useState<ProductFormData>(emptyProduct);
  const [selectedComposedId, setSelectedComposedId] = useState('');

  // La orden que se está viendo siempre sale de la lista en tiempo real (si otro usuario
  // la edita, el modal se actualiza solo).
  const viewingJob = useMemo(() => jobOrders.find(o => o.id === viewingJobId) ?? null, [jobOrders, viewingJobId]);
  const viewProducts = useMemo(
    () => (viewingJobId ? jobProducts.filter(p => p.jobOrderId === viewingJobId) : []),
    [jobProducts, viewingJobId],
  );

  const isJobFieldEditable = useCallback((fieldName: string) => {
    if (isProcessing) return false;
    if (currentUser?.roleId === 'admin_role') return true;
    const requiredRole = fieldRoles[fieldName];
    return !requiredRole || currentUser?.roleId === requiredRole;
  }, [isProcessing, currentUser, fieldRoles]);

  const flatDetailOptions = useMemo(() => flattenEntrances(entrances), [entrances]);

  // Stock por detalle = recibido - consumido en DB - consumido en el formulario actual (no guardado aún).
  const getFormStock = useCallback((detailId: string) => {
    const option = flatDetailOptions.find(o => o.detailId === detailId);
    if (!option) return 0;
    const usedInDB = usage.get(detailId) || 0;
    const usedInForm = formProducts
      .filter(p => !p.id && (p.entranceDetailId || p.itemEntranceId) === detailId)
      .reduce((acc, p) => acc + p.quantity, 0);
    return option.itemsArrived - usedInDB - usedInForm;
  }, [flatDetailOptions, usage, formProducts]);

  const productOptions = useMemo(() => flatDetailOptions.map(opt => ({
    id: opt.composedId,
    label: `${opt.itemName} | Model: ${opt.modelPart || '-'} | Serial: ${opt.serial || '-'} | PO: ${opt.po || '-'} | Stock: ${getFormStock(opt.detailId)}`,
  })), [flatDetailOptions, getFormStock]);

  const handleOpenModal = (job: JobOrder | null) => {
    setViewingJobId(null);
    if (job) {
      setEditingJob(job.id);
      setFormData({
        jobOrder: job.jobOrder, madeBy: job.madeBy || authorName, destination: job.destination,
        description: job.description, workFinish: job.workFinish, pendingWork: job.pendingWork,
        schedule: job.schedule, createdAt: job.createdAt || getTodayString(),
      });
      setFormProducts(jobProducts.filter(p => p.jobOrderId === job.id));
    } else {
      setEditingJob(null);
      setFormData(initialFormState);
      setFormProducts([]);
    }
    setIsJobModalOpen(true);
  };

  const handleDelete = async (job: JobOrder, e?: MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(`Delete order #${formatSeq(job.visualSeq)} (${job.destination})? Its products will be returned to stock.`)) return;
    try {
      // Borramos también los productos asociados: si quedaran huérfanos seguirían
      // descontando stock de un trabajo que ya no existe.
      const batch = writeBatch(db);
      batch.delete(doc(db, 'jobOrders', job.id));
      jobProducts.filter(p => p.jobOrderId === job.id && p.id).forEach(p => batch.delete(doc(db, 'jobProducts', p.id!)));
      await batch.commit();
      AuditLogger.logDelete('WorkActivity', authorName, job.id, job);
      setViewingJobId(null);
    } catch (error) {
      console.error('Error deleting order', error);
      alert('Error deleting the record.');
    }
  };

  const handleSaveOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      let savedJobId = editingJob;
      if (editingJob) {
        await updateDoc(doc(db, 'jobOrders', editingJob), { ...formData });
        AuditLogger.logUpdate('WorkActivity', authorName, editingJob, formData);
      } else {
        const seq = await nextSequence('jobOrdersSeq');
        const docRef = await addDoc(collection(db, 'jobOrders'), { ...formData, createdBy: authorName, seq });
        savedJobId = docRef.id;
        AuditLogger.logCreate('WorkActivity', authorName, docRef.id, formData);
      }
      const pending = formProducts.filter(p => !p.id);
      if (pending.length && savedJobId) {
        const batch = writeBatch(db);
        for (const product of pending) {
          batch.set(doc(collection(db, 'jobProducts')), { ...product, jobOrderId: savedJobId });
        }
        await batch.commit();
      }
      setIsJobModalOpen(false);
    } catch (error) {
      console.error('Error saving order', error);
      alert('Error saving the record.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveQuickDestination = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const seq = await nextSequence('seq_catalog_destinations');
      const payload = { ...newDestData, seq, createdAt: new Date().toISOString() };
      const docRef = await addDoc(collection(db, 'catalog_destinations'), payload);
      AuditLogger.logCreate('Catalogs (Destinations)', authorName, docRef.id, payload);
      // El campo `destination` de la orden guarda la dirección (description), igual que el buscador.
      setFormData(prev => ({ ...prev, destination: newDestData.description }));
      setIsQuickDestOpen(false);
      setNewDestData({ description: '', property: '', contact: '' });
    } catch (error) {
      console.error('Error adding quick destination', error);
      alert('Error adding destination');
    }
  };

  const handleItemSelection = (composedId: string) => {
    setSelectedComposedId(composedId);
    const option = flatDetailOptions.find(o => o.composedId === composedId);
    if (!option) { setCurrentProduct(emptyProduct); return; }
    const stock = getFormStock(option.detailId);
    setCurrentProduct({
      itemEntranceId: option.entranceId, entranceDetailId: option.detailId, itemName: option.itemName,
      modelPart: option.modelPart, serial: option.serial, po: option.po, quantity: stock > 0 ? 1 : 0,
    });
  };

  const currentSelectionStock = currentProduct.entranceDetailId ? getFormStock(currentProduct.entranceDetailId) : 0;
  const quantityDisabled = !currentProduct.entranceDetailId || currentSelectionStock <= 0;

  const handleAddProductSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!currentProduct.itemEntranceId || !currentProduct.entranceDetailId) { alert('Please select a product first.'); return; }
    if (currentSelectionStock <= 0 || currentProduct.quantity > currentSelectionStock) {
      alert('There is no stock of this product. Please update the stock.');
      return;
    }
    try {
      if (viewingJob) {
        await addDoc(collection(db, 'jobProducts'), { ...currentProduct, jobOrderId: viewingJob.id });
        AuditLogger.logUpdate('WorkActivity Products', authorName, viewingJob.id, { addedProduct: currentProduct });
      } else {
        setFormProducts(prev => [...prev, { ...currentProduct, jobOrderId: 'pending' }]);
      }
      setCurrentProduct(emptyProduct);
      setSelectedComposedId('');
      setIsProductModalOpen(false);
    } catch (error) {
      console.error('Error adding product', error);
      alert('Error adding the product.');
    }
  };

  const handleRemoveProductFromDetails = async (product: JobProduct) => {
    if (!product.id || !window.confirm(`Remove ${product.itemName} from this order?`)) return;
    await deleteDoc(doc(db, 'jobProducts', product.id));
    if (viewingJob) AuditLogger.logUpdate('WorkActivity Products', authorName, viewingJob.id, { removedProduct: product });
  };

  const handleRemoveProductFromForm = async (index: number) => {
    const product = formProducts[index];
    if (product.id) {
      // Producto ya persistido en una orden existente: se borra de la DB.
      if (!window.confirm(`Remove ${product.itemName} from this order?`)) return;
      await deleteDoc(doc(db, 'jobProducts', product.id));
      if (editingJob) AuditLogger.logUpdate('WorkActivity Products', authorName, editingJob, { removedProduct: product });
    }
    setFormProducts(prev => prev.filter((_, i) => i !== index));
  };

  const displayedOrders = useMemo(() => {
    const target: WorkFinish = showHistoric ? 'YES' : 'NO';
    return jobOrders
      .filter(o => o.workFinish === target)
      .filter(o => matchesSearch(
        searchTerm, o.jobOrder, o.madeBy, o.destination, o.description, o.pendingWork,
        formatDateDisplay(o.createdAt), formatDateDisplay(o.schedule),
      ));
  }, [jobOrders, showHistoric, searchTerm]);

  const lockHint = (field: string) => !isJobFieldEditable(field) && <span className="lock-hint"><Lock size={12} /> Locked</span>;
  const inputCls = (field: string) => (isJobFieldEditable(field) ? undefined : 'locked');

  if (isLoading) return <LoadingScreen message="Loading work activity..." />;

  return (
    <div className="card">
      <ModuleHeader
        icon={<Briefcase size={24} />}
        title={showHistoric ? 'Historic Records' : 'Work Activity'}
        subtitle={showHistoric ? 'Completed orders' : 'Active job orders'}
        searchValue={searchTerm}
        onSearch={setSearchTerm}
        actions={
          <>
            <button type="button" className={`action btn-primary btn-header${showHistoric ? ' muted' : ''}`} onClick={() => setShowHistoric(v => !v)}>
              {showHistoric ? 'View Active' : 'Record'}
            </button>
            <RequirePermission permission="add_work_activity">
              {!showHistoric && (
                <button type="button" className="action btn-primary btn-header" onClick={() => handleOpenModal(null)}>
                  <Plus size={18} /> New Order
                </button>
              )}
            </RequirePermission>
          </>
        }
      />

      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th className="col-actions">Actions</th>
              <th className="col-seq">#</th>
              <th>Registration Date</th>
              <th>Schedule</th>
              <th>Ordered by</th>
              <th>Made by</th>
              <th>Address</th>
              <th>Description</th>
              <th className="text-center">Work Finish</th>
              <th>Pending Work</th>
            </tr>
          </thead>
          <tbody>
            {displayedOrders.length === 0 && <tr><td colSpan={10} className="empty-state">No records found.</td></tr>}
            {displayedOrders.map(order => (
              <tr key={order.id} className="clickable-row" onClick={() => setViewingJobId(order.id)}>
                <td data-label="Actions" className="cell-actions">
                  <div className="action-btns">
                    <RequirePermission permission="edit_work_activity">
                      <button type="button" className="icon-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenModal(order); }} title="Edit Order">
                        <Edit2 size={16} />
                      </button>
                    </RequirePermission>
                    <RequirePermission permission="delete_work_activity">
                      <button type="button" className="icon-btn delete" onClick={(e) => handleDelete(order, e)} title="Delete Order">
                        <Trash2 size={16} />
                      </button>
                    </RequirePermission>
                  </div>
                </td>
                <td data-label="#" className="col-seq"><SeqBadge seq={order.visualSeq} /></td>
                <td data-label="Registration Date">{formatDateDisplay(order.createdAt)}</td>
                <td data-label="Schedule" className="fw-bold text-primary">{formatDateDisplay(order.schedule)}</td>
                <td data-label="Ordered by" className="fw-bold">{order.jobOrder}</td>
                <td data-label="Made by" className="fw-bold text-accent">{order.madeBy || 'Unassigned'}</td>
                <td data-label="Address">{order.destination}</td>
                <td data-label="Description">{order.description}</td>
                <td data-label="Status" className="text-center"><WorkFinishBadge value={order.workFinish} /></td>
                <td data-label="Pending Work">{order.pendingWork || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FieldSecurityModal
        isOpen={isProductConfigOpen}
        onClose={() => setIsProductConfigOpen(false)}
        title="Required Fields"
        groups={[{ fields: PRODUCT_FIELDS, isRequired: isProdReq, toggleRequired: toggleProdReq }]}
      />
      <FieldSecurityModal
        isOpen={isJobConfigOpen}
        onClose={() => setIsJobConfigOpen(false)}
        roles={roles}
        groups={[{ fields: JOB_FIELDS, isRequired: isJobReq, toggleRequired: toggleJobReq, fieldRoles, setFieldRole }]}
      />

      {viewingJob && (
        <Modal
          size="large"
          title={<span className="flex-row-md"><SeqBadge seq={viewingJob.visualSeq} /> Order Details</span>}
          onClose={() => setViewingJobId(null)}
          actions={
            <>
              <RequirePermission permission="edit_work_activity">
                <button type="button" className="action btn-primary" onClick={() => handleOpenModal(viewingJob)}><Edit2 size={16} /> Edit</button>
              </RequirePermission>
              <RequirePermission permission="delete_work_activity">
                <button type="button" className="action btn-danger" onClick={(e) => handleDelete(viewingJob, e)}><Trash2 size={16} /> Delete</button>
              </RequirePermission>
            </>
          }
        >
          <dl className="details-grid">
            <div className="detail-item"><dt>Registration Date</dt><dd>{formatDateDisplay(viewingJob.createdAt)}</dd></div>
            <div className="detail-item"><dt>Address</dt><dd>{viewingJob.destination}</dd></div>
            <div className="detail-item"><dt>Ordered by</dt><dd>{viewingJob.jobOrder}</dd></div>
            <div className="detail-item"><dt>Made by</dt><dd className="fw-bold text-accent">{viewingJob.madeBy || 'Unassigned'}</dd></div>
            <div className="detail-item"><dt>Schedule</dt><dd>{formatDateDisplay(viewingJob.schedule)}</dd></div>
            <div className="detail-item"><dt>Status</dt><dd><WorkFinishBadge value={viewingJob.workFinish} /></dd></div>
            <div className="detail-item"><dt>Pending Work</dt><dd>{viewingJob.pendingWork || '-'}</dd></div>
            <div className="detail-item full-width"><dt>Description</dt><dd>{viewingJob.description}</dd></div>
          </dl>

          <div className="products-section">
            <div className="products-header">
              <h4>Associated Products / Materials</h4>
              <RequirePermission permission="edit_work_activity">
                <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)}><Plus size={16} /> Add Product</button>
              </RequirePermission>
            </div>
            <div className="table-container">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th className="col-actions narrow">Action</th>
                    <th>#</th><th>Item Name</th><th>Model</th><th>Serial</th><th>PO #</th><th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {viewProducts.length === 0 && <tr><td colSpan={7} className="empty-state">No products attached.</td></tr>}
                  {viewProducts.map((p, i) => (
                    <tr key={p.id}>
                      <td data-label="Action" className="cell-actions">
                        <RequirePermission permission="edit_work_activity">
                          <button type="button" className="btn-text-danger" onClick={() => handleRemoveProductFromDetails(p)}>Remove</button>
                        </RequirePermission>
                      </td>
                      <td data-label="#">{formatSeq(i + 1)}</td>
                      <td data-label="Item">{p.itemName}</td>
                      <td data-label="Model">{p.modelPart}</td>
                      <td data-label="Serial">{p.serial || '-'}</td>
                      <td data-label="PO" className="fw-bold text-primary">{p.po || '-'}</td>
                      <td data-label="Qty">{p.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {isJobModalOpen && (
        <Modal
          size="large"
          title={editingJob ? 'Edit Order' : 'Create New Order'}
          onClose={() => setIsJobModalOpen(false)}
          onSubmit={handleSaveOrder}
          actions={
            <>
              <RequirePermission permission="manage_security">
                <button type="button" className="icon-btn" onClick={() => setIsJobConfigOpen(true)} title="Configure Field Security"><Settings size={20} /></button>
              </RequirePermission>
              <button type="submit" className="action btn-primary" disabled={isProcessing}>{isProcessing ? 'Saving...' : 'Save Order'}</button>
            </>
          }
        >

              <div className="form-grid">
                <div className="form-group">
                  <label>Registration Date {isJobReq('createdAt') && '*'} {lockHint('createdAt')}</label>
                  <input type="date" className={inputCls('createdAt')} value={formData.createdAt} onChange={e => setFormData({ ...formData, createdAt: e.target.value })} required={isJobReq('createdAt')} disabled={!isJobFieldEditable('createdAt')} />
                </div>

                <div className="form-group">
                  <label>Address {isJobReq('destination') && '*'} {lockHint('destination')}</label>
                  <div className={`input-with-btn${isJobFieldEditable('destination') ? '' : ' field-locked-wrap'}`}>
                    <DestinationSearch value={formData.destination} onSelect={(val) => setFormData({ ...formData, destination: val })} required={isJobReq('destination')} />
                    <button type="button" className="action btn-secondary btn-attach" onClick={() => setIsQuickDestOpen(true)} title="Add New Destination" disabled={!isJobFieldEditable('destination')}>
                      <Plus size={20} />
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ordered by {isJobReq('jobOrder') && '*'}</label>
                  <input type="text" className="readonly-muted" value={formData.jobOrder} readOnly title="This field is auto-populated and cannot be changed for auditing purposes." />
                </div>

                <div className="form-group">
                  <label>Made by {isJobReq('madeBy') && '*'} {lockHint('madeBy')}</label>
                  <select className={inputCls('madeBy')} value={formData.madeBy || ''} onChange={e => setFormData({ ...formData, madeBy: e.target.value })} required={isJobReq('madeBy')} disabled={!isJobFieldEditable('madeBy')}>
                    <option value="">-- Unassigned --</option>
                    {users.map(u => { const name = displayName(u, u.email); return <option key={u.id} value={name}>{name}</option>; })}
                  </select>
                </div>

                <div className="form-group">
                  <label>Work Finish {isJobReq('workFinish') && '*'} {lockHint('workFinish')}</label>
                  <select className={inputCls('workFinish')} value={formData.workFinish} onChange={e => setFormData({ ...formData, workFinish: e.target.value as WorkFinish })} required={isJobReq('workFinish')} disabled={!isJobFieldEditable('workFinish')}>
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                </div>

                <div className="form-group span-2">
                  <label>Description {isJobReq('description') && '*'} {lockHint('description')}</label>
                  <input type="text" className={inputCls('description')} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} required={isJobReq('description')} disabled={!isJobFieldEditable('description')} />
                </div>
                <div className="form-group">
                  <label>Schedule {isJobReq('schedule') && '*'} {lockHint('schedule')}</label>
                  <input type="date" className={inputCls('schedule')} value={formData.schedule} onChange={e => setFormData({ ...formData, schedule: e.target.value })} required={isJobReq('schedule')} disabled={!isJobFieldEditable('schedule')} />
                </div>
                <div className="form-group">
                  <label>Pending Work {isJobReq('pendingWork') && '*'} {lockHint('pendingWork')}</label>
                  <input type="text" className={inputCls('pendingWork')} value={formData.pendingWork} onChange={e => setFormData({ ...formData, pendingWork: e.target.value })} required={isJobReq('pendingWork')} disabled={!isJobFieldEditable('pendingWork')} />
                </div>
              </div>

              <div className="products-section">
                <div className="products-header">
                  <h4>Products List</h4>
                  <button type="button" className="action btn-secondary btn-sm" onClick={() => setIsProductModalOpen(true)} disabled={isProcessing}><Plus size={16} /> Add Product</button>
                </div>
                <div className="table-container">
                  <table className="responsive-table">
                    <thead>
                      <tr><th className="col-actions narrow">Action</th><th>#</th><th>Item</th><th>Model</th><th>PO #</th><th>Qty</th></tr>
                    </thead>
                    <tbody>
                      {formProducts.length === 0 && <tr><td colSpan={6} className="empty-state">No products added. Click &quot;+ Add Product&quot;.</td></tr>}
                      {formProducts.map((p, index) => (
                        <tr key={p.id ?? `pending-${index}`}>
                          <td data-label="Action" className="cell-actions">
                            <button type="button" className="btn-text-danger" onClick={() => handleRemoveProductFromForm(index)} disabled={isProcessing}>Remove</button>
                          </td>
                          <td data-label="#">{formatSeq(index + 1)}</td>
                          <td data-label="Item">{p.itemName}</td>
                          <td data-label="Model">{p.modelPart}</td>
                          <td data-label="PO" className="fw-bold text-primary">{p.po || '-'}</td>
                          <td data-label="Qty">{p.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
        </Modal>
      )}

      {isQuickDestOpen && (
        <Modal title="Quick Add Destination" onClose={() => setIsQuickDestOpen(false)} size="md" level={3}>
          <form onSubmit={handleSaveQuickDestination}>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Address * (e.g. 12 Mystyc Ct.)</label>
                <input type="text" required value={newDestData.description} onChange={e => setNewDestData({ ...newDestData, description: e.target.value })} />
              </div>
              <div className="form-group full-width">
                <label>Property / Complex (e.g. Hidden Creek Apartments)</label>
                <input type="text" value={newDestData.property} onChange={e => setNewDestData({ ...newDestData, property: e.target.value })} />
              </div>
              <div className="form-group full-width">
                <label>Contact (Optional)</label>
                <input type="text" value={newDestData.contact} onChange={e => setNewDestData({ ...newDestData, contact: e.target.value })} />
              </div>
            </div>
            <div className="form-actions borderless">
              <button type="submit" className="action btn-primary">Save Destination</button>
            </div>
          </form>
        </Modal>
      )}

      {isProductModalOpen && (
        <Modal
          size="2xl"
          level={2}
          title="Add Product"
          onClose={() => setIsProductModalOpen(false)}
          onSubmit={handleAddProductSubmit}
          actions={
            <>
              <button type="button" className="icon-btn" onClick={() => setIsProductConfigOpen(true)} title="Configure Required Fields"><Settings size={20} /></button>
              <button type="submit" className="action btn-primary">Add to List</button>
            </>
          }
        >
              <div className="product-picker">
                <div className="form-group product-picker-item">
                  <label>Select Item {isProdReq('itemEntranceId') && '*'}</label>
                  <SearchableSelect
                    options={productOptions}
                    value={selectedComposedId}
                    onChange={handleItemSelection}
                    placeholder="-- Type name, model, serial, PO... --"
                    required={isProdReq('itemEntranceId')}
                  />
                </div>
                <div className="form-group product-picker-qty">
                  <label>Quantity {isProdReq('quantity') && '*'}</label>
                  <input
                    type="number" min="1" max={currentSelectionStock || undefined}
                    className={quantityDisabled ? 'locked' : undefined}
                    disabled={quantityDisabled}
                    value={currentProduct.quantity}
                    onChange={e => setCurrentProduct({ ...currentProduct, quantity: Math.min(Number(e.target.value), currentSelectionStock) })}
                    required={isProdReq('quantity')}
                  />
                  {currentProduct.entranceDetailId && currentSelectionStock <= 0 && <span className="hint text-danger fw-bold">Out of stock</span>}
                  {currentProduct.entranceDetailId && currentSelectionStock > 0 && <span className="hint">Max available: {currentSelectionStock}</span>}
                </div>
              </div>
        </Modal>
      )}
    </div>
  );
}
