import { Settings } from 'lucide-react';
import Modal from './Modal';
import type { Role } from '../types';

export interface FieldDef { name: string; label: string }

interface FieldGroup {
  title?: string;
  fields: FieldDef[];
  isRequired: (field: string) => boolean;
  toggleRequired: (field: string) => void;
  /** Si se pasa, muestra la columna de rol permitido para editar. */
  fieldRoles?: Record<string, string>;
  setFieldRole?: (field: string, roleId: string) => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groups: FieldGroup[];
  roles?: Role[];
  title?: string;
}

/**
 * Modal de "Form Security & Fields": campos obligatorios + seguridad a nivel de campo.
 * Reemplaza el antiguo FieldConfigModal y las dos copias del modal de seguridad que
 * había en Work Activity e Item Entrance.
 */
export default function FieldSecurityModal({ isOpen, onClose, groups, roles = [], title = 'Form Security & Fields' }: Props) {
  if (!isOpen) return null;
  const hasRoles = groups.some(g => g.fieldRoles && g.setFieldRole);
  return (
    <Modal title={<span className="flex-row"><Settings size={20} /> {title}</span>} onClose={onClose} size="lg" level="top">
      <div className="modal-body">
        <p className="modal-intro">
          {hasRoles
            ? 'Set which fields are mandatory and configure Field-Level Security (which Role is allowed to edit each field).'
            : 'Select which fields should be mandatory for this form.'}
        </p>
        {groups.map((g, gi) => (
          <div key={g.title ?? gi} className={gi > 0 ? 'mt-4' : undefined}>
            {g.title && <h4 className="text-primary mb-3">{g.title}</h4>}
            <div className="table-container">
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th className="text-center">Required</th>
                    {g.fieldRoles && <th>Allowed Role (Edit Access)</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.fields.map(f => (
                    <tr key={f.name}>
                      <td data-label="Field" className="fw-bold">{f.label}</td>
                      <td data-label="Required" className="text-center">
                        <input
                          type="checkbox"
                          className="checkbox-lg"
                          checked={g.isRequired(f.name)}
                          onChange={() => g.toggleRequired(f.name)}
                        />
                      </td>
                      {g.fieldRoles && g.setFieldRole && (
                        <td data-label="Allowed Role">
                          <select value={g.fieldRoles[f.name] || ''} onChange={e => g.setFieldRole?.(f.name, e.target.value)}>
                            <option value="">All Roles (Unrestricted)</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <div className="btn-container">
        <button type="button" className="action btn-primary w-100" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
