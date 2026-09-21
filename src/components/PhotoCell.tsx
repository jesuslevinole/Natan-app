import { useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import './PhotoCell.css';

interface Props {
  src?: string | null;
  /** Título del modal al ampliar ("Bathroom Faucet"). */
  title: string;
  /** Lado de la miniatura en px. */
  size?: number;
}

/** Miniatura de foto en una celda de tabla; clic para ver en grande. */
export default function PhotoCell({ src, title, size = 42 }: Props) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className="photo-cell empty" title="No photo"><ImageOff size={15} /></span>;
  return (
    <>
      <button
        type="button"
        className="photo-cell"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`View photo — ${title}`}
        aria-label={`View photo of ${title}`}
      >
        <img src={src} alt={title} width={size} height={size} loading="lazy" />
      </button>
      {open && (
        <div className="photo-lightbox" role="dialog" aria-label={title} onClick={() => setOpen(false)}>
          <figure onClick={e => e.stopPropagation()}>
            <button type="button" className="photo-lightbox-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            <img src={src} alt={title} />
            <figcaption>{title}</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
