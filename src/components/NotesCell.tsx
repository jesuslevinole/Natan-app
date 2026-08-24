import { useState, type MouseEvent, type ReactNode } from 'react';
import { MessageSquareText } from 'lucide-react';
import Modal, { type ModalLevel } from './Modal';
import './NotesCell.css';

interface Props {
  text?: string | null;
  /** Título del modal, ej. "Pending work — Order 014". */
  title: ReactNode;
  /** Texto de apoyo debajo del título del modal. */
  subtitle?: string;
  level?: ModalLevel;
  /** Muestra un extracto corto junto al ícono (solo desktop). */
  preview?: boolean;
}

/**
 * Celda para notas/observaciones largas: en la tabla se ve un ícono (con punto si hay
 * contenido) y al hacer clic se abre un modal con el texto completo. Evita que un
 * comentario largo rompa el alto de la fila.
 */
export default function NotesCell({ text, title, subtitle, level = 2, preview = false }: Props) {
  const [open, setOpen] = useState(false);
  const value = (text ?? '').trim();
  const hasText = value.length > 0;

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    if (hasText) setOpen(true);
  };

  return (
    <>
      <span className="notes-cell">
        <button
          type="button"
          className={`notes-btn${hasText ? ' has-text' : ''}`}
          onClick={handleOpen}
          disabled={!hasText}
          title={hasText ? 'View notes' : 'No notes'}
          aria-label={hasText ? 'View notes' : 'No notes'}
        >
          <MessageSquareText size={16} />
          {hasText && <span className="notes-dot" />}
        </button>
        {preview && hasText && <span className="notes-preview" title={value}>{value}</span>}
      </span>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)} size="md" level={level}>
          <div className="modal-body">
            {subtitle && <p className="modal-intro">{subtitle}</p>}
            <p className="notes-body">{value}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
