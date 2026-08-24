import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, FilterX, RotateCcw, Settings2 } from 'lucide-react';
import './DataTable.css';

export type ColumnType = 'text' | 'number' | 'date';
export type ColumnAlign = 'left' | 'center' | 'right';
export type SortDir = 'asc' | 'desc';
export type CellValue = string | number | null | undefined;

export interface DataColumn<T> {
  id: string;
  header: string;
  /** Valor crudo de la celda: se usa para ordenar y filtrar. Para fechas devolver YYYY-MM-DD. */
  value: (row: T) => CellValue;
  /** Render personalizado. Si no se pasa, se muestra `value(row)` (o "-" si está vacío). */
  render?: (row: T) => ReactNode;
  type?: ColumnType;
  align?: ColumnAlign;
  /** default true */
  sortable?: boolean;
  /** default true */
  filterable?: boolean;
  /** default true — si es false la columna no aparece en el selector y no se puede ocultar. */
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Ancho fijo (ej. '120px'). Se aplica como variable CSS. */
  width?: string;
  /** Clase extra para las celdas del cuerpo. */
  className?: string;
  nowrap?: boolean;
}

export interface SortState {
  id: string;
  dir: SortDir;
}

interface Props<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Clave para persistir columnas visibles y tamaño de página en localStorage. */
  storageKey?: string;
  onRowClick?: (row: T) => void;
  /** Columna de acciones (siempre primera). El contenido se recibe por fila. */
  actions?: (row: T) => ReactNode;
  actionsHeader?: string;
  /** Si se pasa, cada fila tiene un chevron que abre un panel debajo con este contenido. */
  renderExpanded?: (row: T) => ReactNode;
  initialSort?: SortState;
  /** 0 desactiva la paginación. */
  pageSize?: number;
  emptyMessage?: string;
  /** Contenido a la izquierda de la barra de herramientas (chips de filtro, etc.). */
  toolbar?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** Filas más bajas, para listados densos (reportes, paneles del dashboard). */
  compact?: boolean;
  /** Oculta la barra de herramientas (contador, filtros, columnas). */
  hideToolbar?: boolean;
}

interface Persisted {
  hidden?: string[];
  pageSize?: number;
}

const PAGE_SIZES = [10, 25, 50, 100];

const readPersisted = (key?: string): Persisted => {
  if (!key) return {};
  try {
    const raw = localStorage.getItem(`natan_table_${key}`);
    return raw ? (JSON.parse(raw) as Persisted) : {};
  } catch {
    return {};
  }
};

const writePersisted = (key: string | undefined, data: Persisted) => {
  if (!key) return;
  try {
    localStorage.setItem(`natan_table_${key}`, JSON.stringify(data));
  } catch {
    /* localStorage lleno o bloqueado: la configuración simplemente no persiste */
  }
};

const isEmpty = (v: CellValue) => v === null || v === undefined || v === '';

const compareValues = (a: CellValue, b: CellValue, type: ColumnType): number => {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // vacíos siempre al final
  if (bEmpty) return -1;
  if (type === 'number') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export default function DataTable<T>({
  columns, rows, rowKey, storageKey, onRowClick, actions, actionsHeader = 'Actions', renderExpanded,
  initialSort, pageSize: initialPageSize = 25, emptyMessage = 'No records found.', toolbar, rowClassName,
  compact = false, hideToolbar = false,
}: Props<T>) {
  const persisted = useMemo(() => readPersisted(storageKey), [storageKey]);

  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(
    persisted.hidden ?? columns.filter(c => c.defaultHidden).map(c => c.id),
  ));
  const [pageSize, setPageSize] = useState(persisted.pageSize ?? initialPageSize);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // Click fuera cierra el selector de columnas (mismo patrón que SearchableSelect).
  useEffect(() => {
    if (!columnsMenuOpen) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setColumnsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [columnsMenuOpen]);

  const visibleColumns = useMemo(() => columns.filter(c => !hidden.has(c.id)), [columns, hidden]);
  const columnById = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);

  const activeFilterCount = Object.values(filters).filter(v => v.trim() !== '').length;

  const processed = useMemo(() => {
    let out = rows;
    if (activeFilterCount > 0) {
      const active = Object.entries(filters).filter(([, v]) => v.trim() !== '').map(([id, v]) => [columnById.get(id), v.trim().toLowerCase()] as const);
      out = out.filter(row => active.every(([col, needle]) => col ? String(col.value(row) ?? '').toLowerCase().includes(needle) : true));
    }
    if (sort) {
      const col = columnById.get(sort.id);
      if (col) {
        const type = col.type ?? 'text';
        const dir = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => compareValues(col.value(a), col.value(b), type) * dir);
      }
    }
    return out;
  }, [rows, filters, activeFilterCount, sort, columnById]);

  const total = processed.length;
  const paginated = pageSize > 0;
  const pageCount = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const pageRows = paginated ? processed.slice((safePage - 1) * pageSize, safePage * pageSize) : processed;
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = paginated ? Math.min(safePage * pageSize, total) : total;

  // Volver a la primera página cuando cambian los datos, filtros u orden.
  useEffect(() => { setPage(1); }, [rows, filters, sort, pageSize]);

  const toggleSort = (col: DataColumn<T>) => {
    if (col.sortable === false) return;
    setSort(prev => {
      if (!prev || prev.id !== col.id) return { id: col.id, dir: col.type === 'date' ? 'desc' : 'asc' };
      if (prev.dir === 'asc') return { id: col.id, dir: 'desc' };
      if (prev.dir === 'desc' && col.type !== 'date') return null;
      return { id: col.id, dir: 'asc' };
    });
  };

  const toggleHidden = (id: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (visibleColumns.length > 1) next.add(id);
      writePersisted(storageKey, { ...persisted, hidden: [...next], pageSize });
      return next;
    });
  };

  const resetColumns = () => {
    const next = new Set(columns.filter(c => c.defaultHidden).map(c => c.id));
    setHidden(next);
    writePersisted(storageKey, { ...persisted, hidden: [...next], pageSize });
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    writePersisted(storageKey, { ...persisted, hidden: [...hidden], pageSize: size });
  };

  const toggleExpanded = (key: string, e: MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const colSpan = visibleColumns.length + (actions ? 1 : 0) + (renderExpanded ? 1 : 0);
  const hideableColumns = columns.filter(c => c.hideable !== false);

  const sortIcon = (col: DataColumn<T>) => {
    if (col.sortable === false) return null;
    if (sort?.id !== col.id) return <ArrowUpDown size={13} className="dt-sort-icon idle" />;
    return sort.dir === 'asc' ? <ArrowUp size={13} className="dt-sort-icon" /> : <ArrowDown size={13} className="dt-sort-icon" />;
  };

  const cellStyle = (col: DataColumn<T>): CSSProperties | undefined =>
    col.width ? ({ '--col-w': col.width } as CSSProperties) : undefined;

  return (
    <div className={`dt${compact ? ' compact' : ''}`}>
      {!hideToolbar && (
        <div className="dt-toolbar">
          <div className="dt-toolbar-left">
            {toolbar}
            <span className="dt-count">
              {total === rows.length ? `${total} record${total === 1 ? '' : 's'}` : `${total} of ${rows.length} records`}
            </span>
          </div>
          <div className="dt-toolbar-right">
            <button type="button" className={`dt-tool${showFilters || activeFilterCount ? ' active' : ''}`} onClick={() => setShowFilters(v => !v)} title="Filter by column">
              {activeFilterCount ? <FilterX size={15} /> : <Filter size={15} />}
              <span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
            </button>
            {activeFilterCount > 0 && (
              <button type="button" className="dt-tool" onClick={() => setFilters({})} title="Clear all column filters">
                <RotateCcw size={14} /> <span>Clear</span>
              </button>
            )}
            {hideableColumns.length > 0 && (
              <div className="dt-columns" ref={columnsMenuRef}>
                <button type="button" className={`dt-tool${columnsMenuOpen ? ' active' : ''}`} onClick={() => setColumnsMenuOpen(v => !v)} title="Choose visible columns">
                  <Settings2 size={15} /> <span>Columns</span> <ChevronDown size={13} />
                </button>
                {columnsMenuOpen && (
                  <div className="dt-columns-menu" role="menu">
                    <div className="dt-columns-menu-head">
                      <span>Visible columns</span>
                      <button type="button" className="dt-link" onClick={resetColumns}>Reset</button>
                    </div>
                    <ul className="checkbox-list">
                      {hideableColumns.map(c => (
                        <li key={c.id}>
                          <label>
                            <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggleHidden(c.id)} />
                            <span>{c.header}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dt-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              {renderExpanded && <th className="dt-th-expand" aria-label="Expand" />}
              {actions && <th className="dt-th-actions">{actionsHeader}</th>}
              {visibleColumns.map(col => (
                <th
                  key={col.id}
                  className={`dt-th align-${col.align ?? 'left'}${col.sortable === false ? '' : ' sortable'}${sort?.id === col.id ? ' sorted' : ''}`}
                  style={cellStyle(col)}
                  onClick={() => toggleSort(col)}
                  aria-sort={sort?.id === col.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="dt-th-inner">{col.header}{sortIcon(col)}</span>
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="dt-filter-row">
                {renderExpanded && <th />}
                {actions && <th />}
                {visibleColumns.map(col => (
                  <th key={col.id} className={`align-${col.align ?? 'left'}`}>
                    {col.filterable !== false && (
                      <input
                        type="search"
                        className="dt-filter-input"
                        placeholder={`Filter ${col.header.toLowerCase()}…`}
                        value={filters[col.id] ?? ''}
                        onChange={e => setFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                        aria-label={`Filter by ${col.header}`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={colSpan} className="dt-empty">{activeFilterCount ? 'No records match the column filters.' : emptyMessage}</td></tr>
            )}
            {pageRows.map(row => {
              const key = rowKey(row);
              const isOpen = expanded.has(key);
              const extra = rowClassName?.(row);
              return (
                <Fragment key={key}>
                  <tr
                    className={`dt-row${onRowClick ? ' clickable' : ''}${isOpen ? ' open' : ''}${extra ? ` ${extra}` : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {renderExpanded && (
                      <td className="dt-td-expand" data-label="">
                        <button type="button" className={`dt-expand-btn${isOpen ? ' open' : ''}`} onClick={e => toggleExpanded(key, e)} title={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    )}
                    {actions && (
                      <td className="dt-td-actions" data-label={actionsHeader}>
                        <div className="action-btns">{actions(row)}</div>
                      </td>
                    )}
                    {visibleColumns.map(col => {
                      const raw = col.value(row);
                      const content = col.render ? col.render(row) : (isEmpty(raw) ? <span className="dt-dash">—</span> : String(raw));
                      return (
                        <td
                          key={col.id}
                          data-label={col.header}
                          className={`align-${col.align ?? 'left'}${col.nowrap ? ' nowrap' : ''}${col.type === 'number' ? ' num' : ''}${col.className ? ` ${col.className}` : ''}`}
                          style={cellStyle(col)}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                  {renderExpanded && isOpen && (
                    <tr className="dt-expanded-row">
                      <td colSpan={colSpan} className="dt-expanded-cell">{renderExpanded(row)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {paginated && total > 0 && (
        <div className="dt-footer">
          <span className="dt-range">Showing <b>{from}–{to}</b> of <b>{total}</b></span>
          <div className="dt-pager">
            <label className="dt-page-size">
              <span>Rows</span>
              <select value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <button type="button" className="dt-page-btn" onClick={() => setPage(1)} disabled={safePage === 1} title="First page"><ChevronsLeft size={16} /></button>
            <button type="button" className="dt-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} title="Previous page"><ChevronLeft size={16} /></button>
            <span className="dt-page-indicator">{safePage} / {pageCount}</span>
            <button type="button" className="dt-page-btn" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={safePage === pageCount} title="Next page"><ChevronRight size={16} /></button>
            <button type="button" className="dt-page-btn" onClick={() => setPage(pageCount)} disabled={safePage === pageCount} title="Last page"><ChevronsRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
