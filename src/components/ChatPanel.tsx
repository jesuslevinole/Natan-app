import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { MessageCircle, Plus, Users, Send, Search, ArrowLeft, Hash, User as UserIcon, Check, CheckCheck, Trash2, Languages } from 'lucide-react';
import { db } from '../firebase';
import Modal from './Modal';
import LoadingScreen from './LoadingScreen';
import { useAppData } from '../hooks/useAppData';
import { useChat } from '../hooks/useChat';
import { useAuth, useAuthorName } from '../hooks/useAuth';
import { ensureConversation, sendChatMessage, markChatRead, hasUnread, unreadCount, isReadByAll, chatDisplayName, deleteMessageForMe, isDeletedForMe, looksSpanish, isSameText } from '../utils/chat';
import { usePresence } from '../hooks/usePresence';
import { translateText } from '../utils/textAssist';
import { formatDateTimeDisplay } from '../utils/helpers';
import { displayName, formatDateDisplay, getTodayString } from '../utils/helpers';
import type { ChatMessage } from '../types';
import './ChatPanel.css';

const MESSAGE_LIMIT = 80;

interface Props {
  /** 'full' = módulo completo (2 paneles en desktop); 'widget' = ventana flotante (1 panel). */
  variant?: 'full' | 'widget';
}

/**
 * Panel del chat interno (DMs y grupos, estilo WhatsApp): lo usan el módulo Chat
 * y el botón flotante. Las conversaciones vienen del ChatProvider global.
 */
export default function ChatPanel({ variant = 'full' }: Props) {
  const { currentUser } = useAuth();
  const authorName = useAuthorName();
  const { users } = useAppData();
  const myEmail = (currentUser?.email || '').toLowerCase();

  const { chats, isLoading: isLoadingChats, loadError } = useChat();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newType, setNewType] = useState<'dm' | 'group'>('dm');
  const [newDmUser, setNewDmUser] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { presence, isOnline } = usePresence();
  // Traducciones por mensaje (cache local): id → { text, shown, loading }.
  const [translations, setTranslations] = useState<Record<string, { text: string; shown: boolean; loading: boolean }>>({});

  // Mensajes que este usuario no borró "para mí".
  const visibleMessages = useMemo(() => messages.filter(m => !isDeletedForMe(m, myEmail)), [messages, myEmail]);

  const activeChat = useMemo(() => chats.find(c => c.id === activeId) ?? null, [chats, activeId]);

  // Mensajes del chat activo, en vivo.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    setIsLoadingMessages(true);
    const q = query(collection(db, 'chats', activeId, 'messages'), orderBy('at', 'desc'), limit(MESSAGE_LIMIT));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })).reverse());
      setIsLoadingMessages(false);
    }, err => { console.error('Messages subscription failed', err); setIsLoadingMessages(false); });
    return () => unsub();
  }, [activeId]);

  // Autoscroll + marcar leído cuando llegan mensajes al chat abierto.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (activeChat && myEmail && hasUnread(activeChat, myEmail)) markChatRead(activeChat.id, myEmail).catch(() => undefined);
  }, [messages, activeChat, myEmail]);

  const otherUsers = useMemo(
    () => users.filter(u => (u.email || '').toLowerCase() !== myEmail).sort((a, b) => displayName(a, a.email).localeCompare(displayName(b, b.email))),
    [users, myEmail],
  );

  const filteredChats = useMemo(() => {
    const term = chatSearch.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter(c => chatDisplayName(c, myEmail).toLowerCase().includes(term) || (c.lastMessage?.text || '').toLowerCase().includes(term));
  }, [chats, chatSearch, myEmail]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeChat || !myEmail) return;
    setIsSending(true);
    try {
      await sendChatMessage(activeChat, text, myEmail, authorName);
      setDraft('');
    } catch (err) {
      console.error('Send failed', err);
      alert('Could not send the message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    if (!activeChat) return;
    if (!window.confirm('Delete this message for you?\n\nOther members of the chat will still see it.')) return;
    try {
      await deleteMessageForMe(activeChat.id, messageId, myEmail);
    } catch (err) {
      console.error('Delete for me failed', err);
      alert('Could not delete the message. Please try again.');
    }
  };

  /** Traduce EN↔ES (auto-detecta el idioma) y muestra la traducción bajo el mensaje. */
  const handleTranslate = async (m: ChatMessage) => {
    const existing = translations[m.id];
    if (existing?.text || existing?.loading) {
      setTranslations(prev => ({ ...prev, [m.id]: { ...prev[m.id], shown: !prev[m.id].shown } }));
      return;
    }
    setTranslations(prev => ({ ...prev, [m.id]: { text: '', shown: true, loading: true } }));
    try {
      // Detecta el idioma; si la "traducción" vuelve casi igual (dirección equivocada),
      // reintenta hacia el otro idioma. Así "Estoy emocionado" nunca se traduce a español.
      const from = looksSpanish(m.text) ? 'es' : 'en';
      const to = from === 'es' ? 'en' : 'es';
      let out = await translateText(m.text, from, to);
      if (isSameText(out, m.text)) {
        const retry = await translateText(m.text, to, from);
        if (!isSameText(retry, m.text)) out = retry;
      }
      setTranslations(prev => ({ ...prev, [m.id]: { text: out, shown: true, loading: false } }));
    } catch (err) {
      console.error('Translate failed', err);
      setTranslations(prev => { const next = { ...prev }; delete next[m.id]; return next; });
      alert('Could not translate right now. Please try again in a moment.');
    }
  };

  /** Estado de presencia para el header de un DM: "Online" o "Last seen ...". */
  const presenceLine = (email: string): string => {
    if (isOnline(email)) return 'Online';
    const r = presence.get(email.toLowerCase());
    return r ? `Last seen ${formatDateTimeDisplay(r.lastSeenAt)}` : 'Direct message';
  };

  const nameOf = (email: string) => {
    const u = users.find(x => (x.email || '').toLowerCase() === email);
    return u ? displayName(u, u.email) : email;
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!myEmail) return;
    setIsCreating(true);
    setError('');
    try {
      let id: string;
      if (newType === 'dm') {
        if (!newDmUser) { setIsCreating(false); return; }
        const other = newDmUser.toLowerCase();
        id = await ensureConversation({
          type: 'dm',
          members: [myEmail, other],
          memberNames: { [myEmail]: authorName, [other]: nameOf(other) },
          createdBy: myEmail,
        });
      } else {
        const members = [myEmail, ...newGroupMembers];
        if (!newGroupName.trim() || members.length < 2) { setIsCreating(false); return; }
        const memberNames: Record<string, string> = { [myEmail]: authorName };
        newGroupMembers.forEach(m => { memberNames[m] = nameOf(m); });
        id = await ensureConversation({ type: 'group', name: newGroupName.trim(), members, memberNames, createdBy: myEmail });
      }
      setIsNewOpen(false);
      setNewDmUser('');
      setNewGroupName('');
      setNewGroupMembers(new Set());
      setActiveId(id);
    } catch (err) {
      console.error('Create chat failed', err);
      setError('Could not create the conversation. Check the Firestore rules for "chats".');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleGroupMember = (email: string) => {
    setNewGroupMembers(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  };

  /** Separador de día entre mensajes. */
  const dayOf = (iso: string) => iso.slice(0, 10);

  if (isLoadingChats) return <LoadingScreen message="Loading chat..." />;

  return (
    <div className={`chat-shell ${variant}`}>
      <div className={`chat-layout ${variant}${activeId ? ' has-active' : ''}`}>
        {/* Lista de conversaciones */}
        <aside className="chat-list">
          <header className="chat-list-head">
            <h3><MessageCircle size={18} /> Chat</h3>
            <button type="button" className="action btn-primary btn-sm" onClick={() => setIsNewOpen(true)}><Plus size={15} /> New</button>
          </header>
          <div className="chat-search">
            <Search size={14} />
            <input type="text" placeholder="Search conversations..." value={chatSearch} onChange={e => setChatSearch(e.target.value)} />
          </div>
          {(error || loadError) && <p className="alert error m-3">{error || loadError}</p>}
          <div className="chat-list-items">
            {filteredChats.length === 0 && <p className="chat-empty-hint">No conversations yet. Start one with <b>New</b>.</p>}
            {filteredChats.map(chat => {
              const unread = unreadCount(chat, myEmail);
              return (
                <button key={chat.id} type="button" className={`chat-item${chat.id === activeId ? ' active' : ''}${unread > 0 ? ' unread' : ''}`} onClick={() => setActiveId(chat.id)}>
                  <span className={`chat-avatar ${chat.type}`}>
                    {chat.type === 'group' ? <Users size={16} /> : <UserIcon size={16} />}
                    {chat.type === 'dm' && isOnline(chat.members.find(m => m !== myEmail) || '') && <span className="chat-online-dot" title="Online" />}
                  </span>
                  <span className="chat-item-body">
                    <span className="chat-item-top">
                      <b>{chatDisplayName(chat, myEmail)}</b>
                      {chat.lastMessage && <small>{formatDateDisplay(chat.lastMessage.at)}</small>}
                    </span>
                    <small className="chat-item-preview">
                      {chat.lastMessage ? `${chat.lastMessage.senderEmail === myEmail ? 'You: ' : ''}${chat.lastMessage.text}` : 'No messages yet'}
                    </small>
                  </span>
                  {unread > 0 && <span className="chat-unread-count" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Panel de mensajes */}
        <section className="chat-panel">
          {!activeChat ? (
            <div className="chat-placeholder">
              <MessageCircle size={44} />
              <h4>Select a conversation</h4>
              <p>Direct messages and group chats between the users of the app.</p>
            </div>
          ) : (
            <>
              <header className="chat-panel-head">
                <button type="button" className="icon-btn chat-back" onClick={() => setActiveId(null)} title="Back to conversations"><ArrowLeft size={18} /></button>
                <span className={`chat-avatar ${activeChat.type}`}>
                  {activeChat.type === 'group' ? <Users size={16} /> : <UserIcon size={16} />}
                  {activeChat.type === 'dm' && isOnline(activeChat.members.find(m => m !== myEmail) || '') && <span className="chat-online-dot" title="Online" />}
                </span>
                <div className="chat-panel-title">
                  <b>{chatDisplayName(activeChat, myEmail)}</b>
                  <small>
                    {activeChat.type === 'group'
                      ? `${activeChat.members.length} members: ${activeChat.members.map(m => activeChat.memberNames[m] || m).join(', ')}`
                      : presenceLine(activeChat.members.find(m => m !== myEmail) || '')}
                  </small>
                </div>
              </header>
              <div className="chat-messages">
                {isLoadingMessages && <p className="chat-empty-hint">Loading messages...</p>}
                {!isLoadingMessages && visibleMessages.length === 0 && <p className="chat-empty-hint">No messages yet — say hello!</p>}
                {visibleMessages.map((m, i) => {
                  const mine = m.senderEmail === myEmail;
                  const showDay = i === 0 || dayOf(visibleMessages[i - 1].at) !== dayOf(m.at);
                  const showSender = !mine && activeChat.type === 'group' && (i === 0 || visibleMessages[i - 1].senderEmail !== m.senderEmail || showDay);
                  const tr = translations[m.id];
                  return (
                    <div key={m.id}>
                      {showDay && <div className="chat-day"><span>{dayOf(m.at) === getTodayString() ? 'Today' : formatDateDisplay(m.at)}</span></div>}
                      <div className={`chat-msg${mine ? ' mine' : ''}`}>
                        {showSender && <small className="chat-msg-sender">{m.senderName}</small>}
                        <div className="chat-msg-row">
                          <span className="chat-msg-actions">
                            <button type="button" className="chat-msg-action" onClick={() => handleTranslate(m)} title="Translate (English ↔ Spanish)" aria-label="Translate message"><Languages size={14} /></button>
                            <button type="button" className="chat-msg-action danger" onClick={() => handleDeleteForMe(m.id)} title="Delete for me (others still see it)" aria-label="Delete message for me"><Trash2 size={14} /></button>
                          </span>
                          <div className="chat-bubble">
                          {m.text}
                          {tr?.shown && (
                            <span className="chat-translation">
                              <Languages size={11} /> {tr.loading ? 'Translating...' : tr.text}
                            </span>
                          )}
                          <small className="chat-msg-time">
                            {new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {mine && (
                              <span className={`chat-checks${isReadByAll(activeChat, m.at, myEmail) ? ' read' : ''}`} title={isReadByAll(activeChat, m.at, myEmail) ? 'Read' : 'Sent'}>
                                {isReadByAll(activeChat, m.at, myEmail) ? <CheckCheck size={13} /> : <Check size={13} />}
                              </span>
                            )}
                          </small>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <form className="chat-input" onSubmit={handleSend}>
                <input type="text" value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${chatDisplayName(activeChat, myEmail)}...`} maxLength={1000} autoFocus />
                <button type="submit" className="action btn-primary" disabled={isSending || !draft.trim()} title="Send"><Send size={16} /></button>
              </form>
            </>
          )}
        </section>
      </div>

      {isNewOpen && (
        <Modal title={<span className="flex-row"><MessageCircle size={20} /> New conversation</span>} onClose={() => setIsNewOpen(false)} size="md" closeDisabled={isCreating}>
          <form onSubmit={handleCreate}>
            <div className="chip-group mb-4">
              <button type="button" className={`chip${newType === 'dm' ? ' active' : ''}`} onClick={() => setNewType('dm')}><UserIcon size={13} /> Direct message</button>
              <button type="button" className={`chip${newType === 'group' ? ' active' : ''}`} onClick={() => setNewType('group')}><Hash size={13} /> Group</button>
            </div>
            {newType === 'dm' ? (
              <div className="form-group">
                <label htmlFor="dm-user">Send a message to *</label>
                <select id="dm-user" value={newDmUser} onChange={e => setNewDmUser(e.target.value)} required>
                  <option value="">-- Select a user --</option>
                  {otherUsers.map(u => <option key={u.id} value={(u.email || '').toLowerCase()}>{displayName(u, u.email)}</option>)}
                </select>
                <span className="hint">If you already have a conversation with this person, it opens instead of creating a new one.</span>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="group-name">Group name *</label>
                  <input id="group-name" type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} required maxLength={60} placeholder="e.g. Maintenance team" />
                </div>
                <div className="form-group">
                  <label>Members * <span className="label-note">(you are included automatically)</span></label>
                  <div className="chat-member-list">
                    {otherUsers.map(u => {
                      const email = (u.email || '').toLowerCase();
                      return (
                        <label key={u.id} className="checkbox-label">
                          <input type="checkbox" className="checkbox-lg" checked={newGroupMembers.has(email)} onChange={() => toggleGroupMember(email)} />
                          {displayName(u, u.email)}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <div className="form-actions">
              <button type="button" className="action btn-secondary" onClick={() => setIsNewOpen(false)} disabled={isCreating}>Cancel</button>
              <button type="submit" className="action btn-primary" disabled={isCreating || (newType === 'dm' ? !newDmUser : !newGroupName.trim() || newGroupMembers.size === 0)}>
                <Send size={15} /> {isCreating ? 'Creating...' : 'Start conversation'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
