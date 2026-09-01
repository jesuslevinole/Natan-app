import { useState } from 'react';
import { Languages, Wand2, Undo2, Loader2 } from 'lucide-react';
import { translateText, fixWriting, type Lang } from '../utils/textAssist';
import './TextAssist.css';

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

type Busy = 'es-en' | 'en-es' | 'fix' | null;

/**
 * Barra de asistencia para campos de texto libre: traducir ES↔EN y corregir la escritura.
 * Guarda el valor anterior para deshacer con un clic. Ver utils/textAssist.ts.
 */
export default function TextAssist({ value, onChange, disabled = false }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const canRun = !disabled && value.trim().length > 1 && !busy;

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<string>) => {
    setBusy(kind);
    setNote('');
    try {
      const before = value;
      const next = await action();
      if (next && next !== before) {
        setPrevious(before);
        onChange(next);
        setNote(kind === 'fix' ? 'Writing corrected.' : 'Translated.');
      } else {
        setNote(kind === 'fix' ? 'No corrections needed.' : 'Nothing to translate.');
      }
    } catch {
      setNote('Service unavailable right now — the text was not changed.');
    } finally {
      setBusy(null);
    }
  };

  const translate = (from: Lang, to: Lang, kind: Exclude<Busy, null>) => run(kind, () => translateText(value, from, to));
  const fix = () => run('fix', async () => (await fixWriting(value)).fixed);
  const undo = () => {
    if (previous === null) return;
    onChange(previous);
    setPrevious(null);
    setNote('Restored previous text.');
  };

  return (
    <div className="text-assist">
      <button type="button" className="text-assist-btn" onClick={() => translate('es', 'en', 'es-en')} disabled={!canRun} title="Translate Spanish → English">
        {busy === 'es-en' ? <Loader2 size={13} className="spin" /> : <Languages size={13} />} ES → EN
      </button>
      <button type="button" className="text-assist-btn" onClick={() => translate('en', 'es', 'en-es')} disabled={!canRun} title="Translate English → Spanish">
        {busy === 'en-es' ? <Loader2 size={13} className="spin" /> : <Languages size={13} />} EN → ES
      </button>
      <button type="button" className="text-assist-btn" onClick={fix} disabled={!canRun} title="Fix spelling & grammar (auto-detects language)">
        {busy === 'fix' ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />} Fix writing
      </button>
      {previous !== null && (
        <button type="button" className="text-assist-btn undo" onClick={undo} disabled={!!busy} title="Restore the text as it was before">
          <Undo2 size={13} /> Undo
        </button>
      )}
      {note && <span className="text-assist-note">{note}</span>}
    </div>
  );
}
