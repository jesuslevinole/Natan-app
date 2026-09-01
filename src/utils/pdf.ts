import { jsPDF } from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable';
import type { CompanySettings } from '../context/companyContext';

/**
 * Exportación a PDF (jsPDF + autotable, cargados bajo demanda desde los módulos).
 * Estilo: encabezado con logo y datos del negocio, franja de KPIs, secciones con
 * tablas zebra y pie con numeración. Pensado para imprimirse o enviarse a gerencia.
 */

// Paleta (RGB) alineada con la app
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_600: [number, number, number] = [71, 85, 105];
const SLATE_400: [number, number, number] = [148, 163, 184];
const SLATE_100: [number, number, number] = [241, 245, 249];
const PRIMARY: [number, number, number] = [37, 99, 235];
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];
const ORANGE: [number, number, number] = [234, 88, 12];
const PURPLE: [number, number, number] = [124, 58, 237];

export const PDF_COLORS = { PRIMARY, GREEN, RED, ORANGE, PURPLE, SLATE: SLATE_600 };

const MARGIN = 40;

export interface PdfKpi {
  label: string;
  value: string;
  note?: string;
  color?: [number, number, number];
}

const imageFormat = (dataUrl: string): 'PNG' | 'JPEG' => (dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG');

export const createDoc = (): jsPDF => new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

const pageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();
const pageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();

/** Encabezado con logo, nombre del negocio, título del documento y metadatos a la derecha. */
export const brandHeader = (doc: jsPDF, company: CompanySettings, title: string, subtitle: string, author: string): number => {
  const w = pageWidth(doc);
  let x = MARGIN;
  const top = 34;
  if (company.logo) {
    try {
      doc.addImage(company.logo, imageFormat(company.logo), MARGIN, top - 6, 44, 44, undefined, 'FAST');
      x = MARGIN + 56;
    } catch { /* logo corrupto: seguimos sin él */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY);
  doc.text((company.name || 'Mr Natan').toUpperCase(), x, top + 4);
  doc.setFontSize(19);
  doc.setTextColor(...SLATE_900);
  doc.text(title, x, top + 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_600);
  doc.text(subtitle, x, top + 40);

  // Meta a la derecha
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const metaLines = [`Generated ${generated}`, author ? `By ${author}` : '', [company.phone, company.email].filter(Boolean).join('  ·  ')].filter(Boolean);
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_400);
  metaLines.forEach((line, i) => doc.text(line, w - MARGIN, top + 8 + i * 11, { align: 'right' }));

  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, top + 52, w - MARGIN, top + 52);
  return top + 68;
};

/** Franja de tarjetas KPI. Devuelve la Y siguiente. */
export const kpiStrip = (doc: jsPDF, y: number, kpis: PdfKpi[]): number => {
  const w = pageWidth(doc);
  const gap = 10;
  const cardW = (w - MARGIN * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardH = 50;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (cardW + gap);
    const color = kpi.color ?? PRIMARY;
    doc.setFillColor(250, 251, 253);
    doc.setDrawColor(...SLATE_100);
    doc.roundedRect(x, y, cardW, cardH, 5, 5, 'FD');
    doc.setFillColor(...color);
    doc.roundedRect(x, y, 3.5, cardH, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_600);
    doc.text(kpi.label.toUpperCase(), x + 12, y + 15);
    doc.setFontSize(15);
    doc.setTextColor(...SLATE_900);
    doc.text(kpi.value, x + 12, y + 33);
    if (kpi.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_400);
      doc.text(doc.splitTextToSize(kpi.note, cardW - 20)[0] as string, x + 12, y + 44);
    }
  });
  return y + cardH + 16;
};

/** Título de sección con barrita de color. Devuelve la Y del contenido. */
export const sectionTitle = (doc: jsPDF, y: number, text: string, color: [number, number, number] = PRIMARY): number => {
  doc.setFillColor(...color);
  doc.roundedRect(MARGIN, y - 9, 3.5, 12, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...SLATE_900);
  doc.text(text, MARGIN + 10, y + 1);
  return y + 12;
};

/** Salta de página si no quedan al menos `needed` pt; devuelve la Y utilizable. */
export const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  if (y + needed <= pageHeight(doc) - 48) return y;
  doc.addPage();
  return 48;
};

const TABLE_BASE: Partial<UserOptions> = {
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, textColor: SLATE_600, lineColor: [226, 232, 240], lineWidth: 0.4 },
  headStyles: { fillColor: SLATE_900, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [248, 250, 252] },
  margin: { left: MARGIN, right: MARGIN, top: 48, bottom: 44 },
};

export const drawTable = (doc: jsPDF, y: number, head: string[], body: (string | number)[][], overrides: Partial<UserOptions> = {}): number => {
  autoTable(doc, { ...TABLE_BASE, ...overrides, head: [head], body, startY: y });
  const lastY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  return lastY + 20;
};

/** Pie en todas las páginas: nombre del negocio, confidencial y numeración. */
export const addFooters = (doc: jsPDF, company: CompanySettings, label: string): void => {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    const w = pageWidth(doc);
    const h = pageHeight(doc);
    doc.setDrawColor(...SLATE_100);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, h - 30, w - MARGIN, h - 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_400);
    doc.text(`${company.name || 'Mr Natan'} — ${label} — Confidential`, MARGIN, h - 18);
    doc.text(`Page ${i} of ${pages}`, w - MARGIN, h - 18, { align: 'right' });
  }
};

/**
 * Convierte un <svg> de recharts en PNG (data URL) copiando los estilos calculados
 * (fill/stroke/font vienen de CSS y no viajan con el serializado).
 */
export const svgToPngDataUrl = (svg: SVGSVGElement, scale = 2): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));

    // Copiar estilos calculados de los nodos con estilo por CSS
    const source = svg.querySelectorAll<SVGElement>('text, tspan, line, path, rect, circle');
    const target = clone.querySelectorAll<SVGElement>('text, tspan, line, path, rect, circle');
    source.forEach((el, i) => {
      const computed = window.getComputedStyle(el);
      const dest = target[i];
      if (!dest) return;
      dest.setAttribute('fill', computed.fill);
      dest.setAttribute('stroke', computed.stroke);
      if (el.tagName === 'text' || el.tagName === 'tspan') {
        dest.setAttribute('font-size', computed.fontSize);
        dest.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
      }
    });

    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width, height });
    };
    img.onerror = () => reject(new Error('svg render failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });

/** Busca el SVG de una ChartCard por su `chartId` (atributo data-chart-id). */
export const captureChart = async (chartId: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  const svg = document.querySelector<SVGSVGElement>(`[data-chart-id="${chartId}"] svg`);
  if (!svg) return null;
  try {
    return await svgToPngDataUrl(svg);
  } catch {
    return null;
  }
};

export interface PdfLegendItem { color: string; label: string; value?: string }

export interface ChartImage {
  title: string;
  image: { dataUrl: string; width: number; height: number };
  /** Ocupa todo el ancho (por defecto media página). */
  wide?: boolean;
  /** Leyenda dibujada bajo la imagen (las leyendas de recharts son HTML y no viajan en el SVG). */
  legend?: PdfLegendItem[];
}

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return SLATE_600;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Dibuja tarjetas de gráficos en una grilla de 2 columnas (o ancho completo). */
export const chartGrid = (doc: jsPDF, y: number, charts: ChartImage[]): number => {
  const w = pageWidth(doc);
  const gap = 12;
  const colW = (w - MARGIN * 2 - gap) / 2;
  let cursorY = y;
  let col = 0;
  let rowH = 0;
  for (const chart of charts) {
    const boxW = chart.wide ? w - MARGIN * 2 : colW;
    const maxImgH = chart.wide ? 132 : 112;
    const naturalH = (chart.image.height / chart.image.width) * (boxW - 16);
    const imgH = Math.min(naturalH, maxImgH);
    const imgW = imgH < naturalH ? (chart.image.width / chart.image.height) * imgH : boxW - 16;
    const legendH = chart.legend && chart.legend.length ? Math.ceil(chart.legend.length / (chart.wide ? 4 : 2)) * 13 + 6 : 0;
    const boxH = imgH + 34 + legendH;
    if (chart.wide && col === 1) { cursorY += rowH + gap; col = 0; rowH = 0; }
    cursorY = col === 0 ? ensureSpace(doc, cursorY, boxH) : cursorY;
    const x = MARGIN + (chart.wide ? 0 : col * (colW + gap));
    doc.setDrawColor(...SLATE_100);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cursorY, boxW, boxH, 6, 6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_900);
    doc.text(chart.title, x + 10, cursorY + 16);
    doc.addImage(chart.image.dataUrl, 'PNG', x + 8 + (boxW - 16 - imgW) / 2, cursorY + 24, imgW, imgH, undefined, 'FAST');
    if (chart.legend && chart.legend.length) {
      const perRow = chart.wide ? 4 : 2;
      const cellW = (boxW - 20) / perRow;
      chart.legend.forEach((item, li) => {
        const lx = x + 10 + (li % perRow) * cellW;
        const ly = cursorY + 24 + imgH + 12 + Math.floor(li / perRow) * 13;
        doc.setFillColor(...hexToRgb(item.color));
        doc.circle(lx + 3, ly - 2.5, 3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...SLATE_600);
        const label = item.value ? `${item.label} — ${item.value}` : item.label;
        doc.text(doc.splitTextToSize(label, cellW - 14)[0] as string, lx + 10, ly);
      });
    }
    if (chart.wide) { cursorY += boxH + gap; col = 0; rowH = 0; }
    else if (col === 0) { rowH = boxH; col = 1; }
    else { cursorY += Math.max(rowH, boxH) + gap; col = 0; rowH = 0; }
  }
  if (col === 1) cursorY += rowH + gap;
  return cursorY + 6;
};
