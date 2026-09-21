import { useRef, useState } from 'react';
import { Upload, Trash2, ImageOff } from 'lucide-react';
import { fileToThumbDataUrl, dataUrlTooLarge } from '../utils/image';
import './PhotoInput.css';

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  /** Texto bajo el control. */
  hint?: string;
}

/** Input de foto para formularios: sube, redimensiona a 320px y previsualiza. */
export default function PhotoInput({ value, onChange, disabled = false, hint = 'JPG or PNG. It is resized to 320px and stored with the record.' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file (JPG, PNG or WebP).'); return; }
    try {
      const dataUrl = await fileToThumbDataUrl(file);
      if (dataUrlTooLarge(dataUrl)) { setError('The photo is too large even after resizing. Try a simpler image.'); return; }
      setError('');
      onChange(dataUrl);
    } catch {
      setError('Could not read that image.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="photo-input">
      <div className={`photo-input-preview${value ? '' : ' empty'}`}>
        {value ? <img src={value} alt="Preview" /> : <ImageOff size={20} />}
      </div>
      <div className="photo-input-actions">
        <label className={`action btn-secondary btn-sm photo-input-upload${disabled ? ' disabled' : ''}`}>
          <Upload size={14} /> {value ? 'Replace photo' : 'Upload photo'}
          <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} disabled={disabled} />
        </label>
        {value && (
          <button type="button" className="btn-text-danger flex-row" onClick={() => onChange('')} disabled={disabled}><Trash2 size={13} /> Remove</button>
        )}
        <span className="hint">{hint}</span>
        {error && <span className="hint warn">{error}</span>}
      </div>
    </div>
  );
}
