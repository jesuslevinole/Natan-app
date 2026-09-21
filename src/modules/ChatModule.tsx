import ChatPanel from '../components/ChatPanel';

/** Módulo Chat: el panel completo dentro de un card. */
export default function ChatModule() {
  return (
    <div className="card max-1400 chat-card catalog-manager-anim">
      <ChatPanel variant="full" />
    </div>
  );
}
