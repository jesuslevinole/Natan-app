import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ChatPanel from './ChatPanel';
import { useChat } from '../hooks/useChat';
import { useAuth } from '../hooks/useAuth';
import './ChatWidget.css';

interface Props {
  /** Oculta la burbuja (p. ej. cuando el módulo Chat ya está abierto). */
  hidden?: boolean;
}

/**
 * Burbuja flotante del chat (abajo a la derecha): badge con no leídos, animación
 * de brinco al recibir mensajes y una ventanita con el chat completo.
 */
export default function ChatWidget({ hidden = false }: Props) {
  const { hasPermission } = useAuth();
  const { unreadTotal } = useChat();
  const [open, setOpen] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const prev = useRef(unreadTotal);

  // Brinca cuando el total sube (mensaje nuevo).
  useEffect(() => {
    if (unreadTotal > prev.current) {
      setBouncing(true);
      const timer = setTimeout(() => setBouncing(false), 1200);
      prev.current = unreadTotal;
      return () => clearTimeout(timer);
    }
    prev.current = unreadTotal;
  }, [unreadTotal]);

  if (hidden || !hasPermission('view_chat')) return null;

  return (
    <>
      {open && (
        <div className="chat-widget-window" role="dialog" aria-label="Chat">
          <header className="chat-widget-head">
            <span className="flex-row"><MessageCircle size={17} /> <b>Chat</b></span>
            <button type="button" className="chat-widget-close" onClick={() => setOpen(false)} aria-label="Close chat"><X size={17} /></button>
          </header>
          <div className="chat-widget-body">
            <ChatPanel variant="widget" />
          </div>
        </div>
      )}
      <button
        type="button"
        className={`chat-fab${bouncing ? ' bounce' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen(v => !v)}
        title={unreadTotal > 0 ? `Chat — ${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}` : 'Open chat'}
        aria-label="Chat"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unreadTotal > 0 && <span className="chat-fab-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
      </button>
    </>
  );
}
