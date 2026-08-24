import * as XLSX from 'xlsx';

/** Fila de destino detectada en un archivo importado. */
export interface ImportedDestination {
  description: string;
  property: string;
  street: string;
  unit?: number;
}

const collapseSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

/** "MYSTYC   CT." → "Mystyc Ct." */
export const titleCase = (s: string) =>
  collapseSpaces(s).toLowerCase().replace(/(^|[\s(-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());

type Cell = string | number | boolean | Date | null | undefined;

const isNum = (v: Cell): v is number => typeof v === 'number' && Number.isFinite(v);
const isText = (v: Cell): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Modo "pares": el formato que usa el cliente (HIDDEN_CREEK, LAKEHURST): bloques de
 * columnas donde cada fila es `unidad | calle`, varios bloques uno al lado del otro.
 * Se detecta cualquier celda numérica seguida inmediatamente a la derecha por texto.
 */
const parsePairsLayout = (rows: Cell[][], property: string): ImportedDestination[] => {
  const out: ImportedDestination[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const unit = row[i];
      const street = row[i + 1];
      if (isNum(unit) && isText(street)) {
        const streetName = titleCase(street);
        out.push({ property, street: streetName, unit, description: `${unit} ${streetName}` });
      }
    }
  }
  return out;
};

/**
 * Modo "tabla": primera fila con encabezados (Address/Description, Property, Street, Unit).
 * Útil si el cliente exporta desde otro sistema o desde esta misma app.
 */
const parseTableLayout = (rows: Cell[][], defaultProperty: string): ImportedDestination[] | null => {
  const header = rows[0]?.map(c => (isText(c) ? c.trim().toLowerCase() : ''));
  if (!header) return null;
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const iAddr = col('address', 'description', 'direccion', 'dirección');
  if (iAddr < 0) return null;
  const iProp = col('property', 'complex', 'propiedad');
  const iStreet = col('street', 'calle');
  const iUnit = col('unit', 'unit #', 'unidad', 'apt', 'apartment');
  const out: ImportedDestination[] = [];
  for (const row of rows.slice(1)) {
    const addr = row[iAddr];
    if (!isText(addr)) continue;
    const unitRaw = iUnit >= 0 ? row[iUnit] : undefined;
    out.push({
      description: collapseSpaces(addr),
      property: iProp >= 0 && isText(row[iProp]) ? collapseSpaces(row[iProp] as string) : defaultProperty,
      street: iStreet >= 0 && isText(row[iStreet]) ? titleCase(row[iStreet] as string) : '',
      unit: isNum(unitRaw) ? unitRaw : undefined,
    });
  }
  return out;
};

export interface ParsedWorkbook {
  /** Título detectado en la primera celda de texto (para sugerir el nombre de la propiedad). */
  suggestedProperty: string;
  rows: ImportedDestination[];
}

/** Lee un .xlsx/.xls/.csv y devuelve los destinos detectados (sin escribir nada en Firestore). */
export const parseDestinationsFile = async (file: File, property: string): Promise<ParsedWorkbook> => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  let suggestedProperty = '';
  const rows: ImportedDestination[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, blankrows: false, defval: null });
    if (!suggestedProperty) {
      const firstText = grid.flat().find(isText);
      if (firstText) suggestedProperty = titleCase(firstText);
    }
    const table = parseTableLayout(grid, property);
    rows.push(...(table ?? parsePairsLayout(grid, property)));
  }

  // Dedupe dentro del propio archivo (misma dirección repetida en dos bloques)
  const seen = new Set<string>();
  const unique = rows.filter(r => {
    const key = r.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { suggestedProperty, rows: unique };
};

/** Descarga un array de objetos como archivo .xlsx (una hoja por entrada de `sheets`). */
export const downloadWorkbook = (filename: string, sheets: Array<{ name: string; rows: Record<string, unknown>[] }>) => {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '(empty)': '' }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
};
