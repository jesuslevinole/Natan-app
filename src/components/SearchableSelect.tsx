import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import './SearchableSelect.css';

export interface SearchableOption {
  id: string;
  label: string;
  /** Texto secundario (ej. nombre de la propiedad debajo de la dirección). */
  sublabel?: string;
}

interface Props {
  options: SearchableOption[];
  value: string;
  onChange: (id: string, label: string) => void;
  placeholder?: string;
  required?: boolean;
  /**
   * Si es true, el texto escrito se acepta como valor aunque no exista en las opciones
   * (usado para direcciones nuevas). Si es false, solo se puede elegir una opción.
   */
  allowCustom?: boolean;
  /** Ícono a la izquierda de cada opción. */
  optionIcon?: ReactNode;
  emptyMessage?: string;
  disabled?: boolean;
}

/**
 * Select con buscador. Fusiona los antiguos `SearchableSelect` y `DestinationSearch`
 * quedándose con lo más robusto de cada uno: cierre por click-fuera (en vez de
 * onBlur+setTimeout, que fallaba en móvil) y selección con onMouseDown (no pierde el
 * click cuando el input pierde el foco). Ver code-notes.md.
 */
export default function SearchableSelect({
  options, value, onChange, placeholder = 'Search...', required = false,
  allowCustom = false, optionIcon, emptyMessage = 'No matches found.', disabled = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedLabel = useMemo(
    () => options.find(o => o.id === value)?.label ?? (allowCustom ? value : ''),
    [options, value, allowCustom],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return options;
    return options.filter(o =>
      o.label.toLowerCase().includes(term) || (o.sublabel ?? '').toLowerCase().includes(term),
    );
  }, [options, searchTerm]);

  const select = (opt: SearchableOption) => {
    onChange(opt.id, opt.label);
    setSearchTerm('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) { setIsOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]) { e.preventDefault(); select(filtered[activeIndex]); }
    else if (e.key === 'Escape') setIsOpen(false);
  };

  const wrapperCls = `searchable-select${isOpen ? ' open' : ''}`;

  return (
    <div ref={wrapperRef} className={wrapperCls}>
      <div className="searchable-select-input">
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          placeholder={placeholder}
          value={isOpen ? searchTerm : selectedLabel}
          disabled={disabled}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
            if (allowCustom) onChange(e.target.value, e.target.value);
          }}
          onFocus={() => { setSearchTerm(allowCustom ? value : ''); setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          required={required && !value}
        />
        <Search size={18} className="searchable-select-icon" />
      </div>

      {isOpen && (
        <ul id={listId} role="listbox" className="searchable-select-list">
          {filtered.length === 0 && <li className="searchable-select-empty">{emptyMessage}</li>}
          {filtered.map((opt, idx) => (
            <li
              key={opt.id || `__empty_${idx}`}
              role="option"
              aria-selected={opt.id === value}
              className={`searchable-select-option${idx === activeIndex ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); select(opt); }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {optionIcon}
              <span className="searchable-select-label">
                {opt.label}
                {opt.sublabel && <small>{opt.sublabel}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
