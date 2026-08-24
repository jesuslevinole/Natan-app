import { X } from 'lucide-react';
import type { ReactNode, FormEvent } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'large';
export type ModalLevel = 1 | 2 | 3 | 'top';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  /** Nivel de apilado cuando un modal se abre encima de otro. */
  level?: ModalLevel;
  /** Botones a la derecha del título (guardar, editar, etc.). */
  actions?: ReactNode;
  closeDisabled?: boolean;
  /** Si se pasa, el contenedor del modal es un <form> (el botón submit puede ir en `actions`). */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}

const sizeClass: Record<ModalSize, string> = {
  sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: 'modal-xl', '2xl': 'modal-2xl', large: 'modal-large',
};
const levelClass: Record<Exclude<ModalLevel, 1>, string> = { 2: 'level-2', 3: 'level-3', top: 'level-top' };

/**
 * Contenedor estándar de modal (overlay + card + cabecera con acciones y botón cerrar).
 * Reemplaza el markup que estaba copiado ~14 veces en los módulos.
 */
export default function Modal({ title, onClose, children, size, level = 1, actions, closeDisabled, onSubmit }: Props) {
  const overlayCls = `modal-overlay active${level !== 1 ? ` ${levelClass[level]}` : ''}`;
  const contentCls = `modal-content${size ? ` ${sizeClass[size]}` : ''}`;
  const header = (
    <div className="modal-header">
      <h3>{title}</h3>
      <div className="modal-header-actions">
        {actions}
        <button type="button" className="close-modal" onClick={onClose} disabled={closeDisabled} title="Close">
          <X size={24} />
        </button>
      </div>
    </div>
  );
  return (
    <div className={overlayCls} role="dialog" aria-modal="true">
      {onSubmit
        ? <form className={contentCls} onSubmit={onSubmit}>{header}{children}</form>
        : <div className={contentCls}>{header}{children}</div>}
    </div>
  );
}
