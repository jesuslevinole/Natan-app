import { Languages, Trash2, Check, CheckCheck } from 'lucide-react';
import '../components/ChatPanel.css';

/** Demo estático de burbujas del chat (solo vista previa): mismo markup que ChatPanel. */
export default function ChatBubblesDemo() {
  const bubble = (mine: boolean, text: string, translated?: string) => (
    <div className={`chat-msg${mine ? ' mine' : ''}`}>
      <div className="chat-msg-row">
        <span className="chat-msg-actions">
          <button type="button" className="chat-msg-action" title="Translate (English ↔ Spanish)"><Languages size={13} /></button>
          <button type="button" className="chat-msg-action danger" title="Delete for me (others still see it)"><Trash2 size={13} /></button>
        </span>
        <div className="chat-bubble">
          {text}
          {translated && <span className="chat-translation"><Languages size={11} /> {translated}</span>}
          <small className="chat-msg-time">
            1:53 PM
            {mine && <span className="chat-checks read" title="Read"><CheckCheck size={13} /></span>}
            {!mine && null}
          </small>
        </div>
      </div>
    </div>
  );
  return (
    <div className="card max-1400 chat-card">
      <div className="chat-layout full has-active">
        <section className="chat-panel">
          <div className="chat-messages">
            <div className="chat-day"><span>Today</span></div>
            {bubble(false, 'Me gusta')}
            {bubble(true, "I'm still dealing with this sinus infection, I won't be in today", 'Sigo lidiando con esta sinusitis, hoy no voy a ir')}
            {bubble(false, 'Ok, get well soon!')}
            {bubble(true, 'Thanks — check marks demo')}
          </div>
        </section>
      </div>
    </div>
  );
}

// check helper referenced to keep imports used
void Check;
