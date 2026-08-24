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

// =========================================
// Inventario (reporte "Inventory Report" del cliente u hoja propia)
// =========================================
export interface ImportedInventoryRow {
  category: string;
  date: string;          // YYYY-MM-DD
  model: string;
  po: string;            // "PO 3565" normalizado a "PO3565"; vacío si la fila no tiene PO
  serial: string;
  warrantyExp: string;   // YYYY-MM-DD o ''
  vendor: string;
  manufacturer: string;
  invoice: string;
  price: number | null;
  qty: number;
  comments: string;
}

export interface ImportedPO {
  key: string;           // po o, si no hay, invoice
  po: string;
  supplyCompany: string;
  date: string;          // fecha más antigua de sus filas
  rows: ImportedInventoryRow[];
  units: number;
  value: number;
}

const toIsoDate = (v: Cell): string => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (isNum(v)) {
    // Serial de Excel (días desde 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (!isText(v)) return '';
  const s = v.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const [, m, d, yRaw] = us;
    const y = yRaw.length === 2 ? Number(yRaw) + 2000 : Number(yRaw);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
};

const toNumber = (v: Cell): number | null => {
  if (isNum(v)) return v;
  if (!isText(v)) return null;
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const PO_RE = /^\s*PO[\s#-]*(\d+)\s*$/i;
/** "PO 3565" → "PO3565". Devuelve '' si el texto no es un número de PO. */
export const normalizePO = (v: Cell): string => {
  if (!isText(v)) return '';
  const m = v.match(PO_RE);
  return m ? `PO${m[1]}` : '';
};

/**
 * Lee un archivo de inventario (.xlsx/.xls/.csv). Reconoce los encabezados del reporte del
 * cliente (Item, Purch Date, Model #, Serial #, War Exp, Vendor, Mfr, Invoice, Price, Comments)
 * y una hoja propia con columnas PO # / Qty. Si "Serial #" contiene "PO 1234", se toma como PO.
 */
export const parseInventoryFile = async (file: File): Promise<ImportedInventoryRow[]> => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const out: ImportedInventoryRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: null });
    const headerIdx = grid.findIndex(row => row.some(c => isText(c) && /^(item|category|model)/i.test(c.trim())));
    if (headerIdx < 0) continue;
    const header = grid[headerIdx].map(c => (isText(c) ? c.trim().toLowerCase() : ''));
    const col = (...names: string[]) => header.findIndex(h => names.includes(h));
    const iCat = col('item', 'category', 'categoria', 'categoría');
    const iDate = col('purch date', 'date', 'purchase date', 'fecha');
    const iModel = col('model #', 'model', 'modelo', 'item name');
    const iPO = col('po #', 'po', 'purchase order');
    const iSerial = col('serial #', 'serial');
    const iWar = col('war exp', 'warranty', 'warranty exp');
    const iVendor = col('vendor', 'supply company', 'supplier', 'proveedor');
    const iMfr = col('mfr', 'manufacturer', 'brand');
    const iInv = col('invoice', 'factura');
    const iPrice = col('price', 'unit price', 'precio');
    const iQty = col('qty', 'quantity', 'cantidad', 'units');
    const iCom = col('comments', 'comment', 'notes', 'comentarios');
    if (iModel < 0 && iCat < 0) continue;

    for (const row of grid.slice(headerIdx + 1)) {
      const get = (i: number): Cell => (i >= 0 ? row[i] : null);
      const model = isText(get(iModel)) ? collapseSpaces(get(iModel) as string) : '';
      const category = isText(get(iCat)) ? collapseSpaces(get(iCat) as string) : '';
      if (!model && !category) continue;
      if (/^total/i.test(category) || /^page \d/i.test(category)) continue;
      const serialRaw = get(iSerial);
      let po = normalizePO(get(iPO));
      let serial = '';
      if (!po && normalizePO(serialRaw)) po = normalizePO(serialRaw);
      else if (isText(serialRaw)) serial = collapseSpaces(serialRaw);
      else if (isNum(serialRaw)) serial = String(serialRaw);
      const invoiceRaw = get(iInv);
      const invoice = isText(invoiceRaw) ? collapseSpaces(invoiceRaw).replace(/^\*/, '') : isNum(invoiceRaw) ? String(invoiceRaw) : '';
      const qtyRaw = toNumber(get(iQty));
      out.push({
        category,
        date: toIsoDate(get(iDate)),
        model,
        po,
        serial,
        warrantyExp: toIsoDate(get(iWar)),
        vendor: isText(get(iVendor)) ? collapseSpaces(get(iVendor) as string) : '',
        manufacturer: isText(get(iMfr)) ? collapseSpaces(get(iMfr) as string) : '',
        invoice,
        price: toNumber(get(iPrice)),
        qty: qtyRaw && qtyRaw > 0 ? Math.round(qtyRaw) : 1,
        comments: isText(get(iCom)) ? collapseSpaces(get(iCom) as string) : '',
      });
    }
  }
  return out;
};

/** Agrupa filas por PO (o por factura cuando no hay PO) y fusiona filas idénticas sumando cantidad. */
export const groupInventoryRows = (rows: ImportedInventoryRow[]): ImportedPO[] => {
  const groups = new Map<string, ImportedPO>();
  for (const r of rows) {
    const key = r.po || (r.invoice ? `INV:${r.invoice}` : `ROW:${groups.size}`);
    let g = groups.get(key);
    if (!g) {
      g = { key, po: r.po, supplyCompany: r.vendor, date: r.date, rows: [], units: 0, value: 0 };
      groups.set(key, g);
    }
    if (r.date && (!g.date || r.date < g.date)) g.date = r.date;
    if (!g.supplyCompany && r.vendor) g.supplyCompany = r.vendor;
    const same = g.rows.find(x => x.model === r.model && x.price === r.price && x.invoice === r.invoice && x.serial === r.serial && x.comments === r.comments && x.date === r.date);
    if (same) same.qty += r.qty; else g.rows.push({ ...r });
    g.units += r.qty;
    g.value += (r.price ?? 0) * r.qty;
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
};
