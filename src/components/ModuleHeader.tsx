import type { ReactNode } from 'react';
import SearchBar from './SearchBar';

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  /** Contenido debajo del buscador (por ejemplo, chips de filtro). */
  filters?: ReactNode;
  /** Botones a la derecha. */
  actions?: ReactNode;
}

/** Cabecera estándar de módulo: título | buscador | acciones. Antes se repetía en 7 módulos. */
export default function ModuleHeader({ icon, title, subtitle, searchValue, onSearch, filters, actions }: Props) {
  return (
    <div className="card-header wrap">
      <div className="card-header-text module-header-title">
        <h2>{icon} {title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {onSearch && (
        <div className="module-header-search">
          <SearchBar value={searchValue ?? ''} onChange={onSearch} />
          {filters}
        </div>
      )}
      {actions && <div className="module-header-actions">{actions}</div>}
    </div>
  );
}
