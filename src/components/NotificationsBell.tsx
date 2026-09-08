import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Sparkles, AlertTriangle, Boxes, CheckCircle2 } from 'lucide-react';
import { useAppData } from '../hooks/useAppData';
import { getDetailStock } from '../utils/entrance';
import { getTodayString, formatDateDisplay } from '../utils/helpers';
import { APP_VERSION, CHANGELOG } from '../version';
import type { ModuleId } from '../App';
import './NotificationsBell.css';

const SEEN_KEY = 'natan_seen_version';
const LOW_STOCK_THRESHOLD = 2;

interface Props {
  onNavigate?: (module: ModuleId) => void;
}

/**
 * Campana de notificaciones: novedades de cada versión (marca "nuevo" hasta que el usuario
 * las abre) + alertas operativas en vivo (órdenes vencidas y stock bajo).
 */
export default function NotificationsBell({ onNavigate }: Props) {
  const { jobOrders, entrances, usage } = useAppData();
  const [open, setOpen] = useState(false);
  const [seenVersion, setSeenVersion] = useState<string>(() => {
    try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const today = getTodayString();

  const overdue = useMemo(() => jobOrders.filter(o => o.workFinish === 'NO' && o.schedule && o.schedule < today).length, [jobOrders, today]);
  const lowStock = useMemo(() => {
    let count = 0;
    for (const e of entrances) for (const d of e.details) if (getDetailStock(d, usage) <= LOW_STOCK_THRESHOLD) count += 1;
    return count;
  }, [entrances, usage]);

  const hasNewVersion = seenVersion !== APP_VERSION;
  const badgeCount = (hasNewVersion ? 1 : 0) + (overdue > 0 ? 1 : 0) + (lowStock > 0 ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && hasNewVersion) {
      setSeenVersion(APP_VERSION);
      try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* ignore */ }
    }
  };

  const go = (module: ModuleId) => {
    setOpen(false);
    onNavigate?.(module);
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button type="button" className="bell-btn" onClick={toggle} title="Notifications" aria-label={`Notifications${badgeCount ? ` (${badgeCount})` : ''}`} aria-expanded={open}>
        <Bell size={19} />
        {badgeCount > 0 && <span className="bell-badge">{badgeCount}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <header className="bell-head">
            <h4>Notifications</h4>
            <span className="bell-version">{APP_VERSION}</span>
          </header>

          <div className="bell-section">
            <h5>Alerts</h5>
            {overdue === 0 && lowStock === 0 && (
              <p className="bell-empty"><CheckCircle2 size={14} /> All clear — nothing needs your attention.</p>
            )}
            {overdue > 0 && (
              <button type="button" className="bell-item danger" onClick={() => go('workActivity')}>
                <span className="bell-item-icon"><AlertTriangle size={15} /></span>
                <span><b>{overdue} overdue order{overdue === 1 ? '' : 's'}</b><small>Scheduled before today and not finished</small></span>
              </button>
            )}
            {lowStock > 0 && (
              <button type="button" className="bell-item warn" onClick={() => go('itemEntrance')}>
                <span className="bell-item-icon"><Boxes size={15} /></span>
                <span><b>{lowStock} product{lowStock === 1 ? '' : 's'} low on stock</b><small>{LOW_STOCK_THRESHOLD} units or fewer remaining</small></span>
              </button>
            )}
          </div>

          <div className="bell-section">
            <h5><Sparkles size={13} /> What&apos;s new</h5>
            {CHANGELOG.slice(0, 2).map(entry => (
              <div key={entry.version} className="bell-release">
                <div className="bell-release-head">
                  <b>{entry.version}</b>
                  <small>{formatDateDisplay(entry.date)}</small>
                  {entry.version === APP_VERSION && <span className="badge success">Current</span>}
                </div>
                <ul>
                  {entry.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
