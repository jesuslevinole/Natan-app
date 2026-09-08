import { useState, type FormEvent } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface Props {
  /** Qué se está borrando, para el texto ("Order 014 — 12 Galleon Ct."). */
  label: string;
  onCancel: () => void;
  /** Recibe el motivo ya validado. Debe hacer el borrado (moveToTrash) y cerrar. */
  onConfirm: (reason: string) => Promise<void> | void;
  /** Nivel del modal cuando se abre encima de otro. */
  level?: 1 | 2 | 3;
}

/**
 * Confirmación de borrado con motivo obligatorio. El registro no se pierde:
 * va a la Papelera (Recycle Bin) junto con el motivo y quién lo borró.
 */
export default function DeleteReasonModal({ label, onCancel, onConfirm, level = 2 }: Props) {
  const [reason, setReason] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) { setError('Please write a short reason (at least 3 characters).'); return; }
    setIsBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      console.error('Delete failed', err);
      setError('Could not delete. Please try again.');
      setIsBusy(false);
    }
  };

  return (
    <Modal title={<span className="flex-row"><Trash2 size={20} /> Delete record</span>} onClose={onCancel} size="md" level={level} closeDisabled={isBusy}>
      <form onSubmit={handleSubmit}>
        <p className="alert warning flex-row"><AlertTriangle size={16} /> You are about to delete: <b>{label}</b></p>
        <div className="form-group">
          <label htmlFor="delete-reason">Why is this record being deleted? *</label>
          <input
            id="delete-reason"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. duplicated entry, created by mistake, wrong address..."
            autoFocus
            maxLength={200}
          />
          <span className="hint">The record goes to the Recycle Bin with your name and this reason. An administrator can restore it.</span>
        </div>
        {error && <p className="alert error">{error}</p>}
        <div className="form-actions">
          <button type="button" className="action btn-secondary" onClick={onCancel} disabled={isBusy}>Cancel</button>
          <button type="submit" className="action btn-danger solid" disabled={isBusy}><Trash2 size={16} /> {isBusy ? 'Deleting...' : 'Move to Recycle Bin'}</button>
        </div>
      </form>
    </Modal>
  );
}
