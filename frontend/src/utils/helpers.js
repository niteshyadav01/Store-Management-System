import * as XLSX from 'xlsx';

export function formatNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Integer format — no decimal points (for qty totals and whole-number values)
export function formatInt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(Number(n)).toLocaleString('en-IN');
}

// Indian currency format with ₹ symbol — e.g. ₹2,59,30,099.42
export function formatINR(n) {
  if (n == null || isNaN(n)) return '₹0';
  const rounded = Math.round(Number(n));
  return '₹' + rounded.toLocaleString('en-IN');
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Loose header normaliser
export function normHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function pickCol(row, candidates) {
  const keys = Object.keys(row);
  for (const k of keys) {
    if (candidates.includes(normHeader(k))) return String(row[k] || '').trim();
  }
  for (const k of keys) {
    const n = normHeader(k);
    if (candidates.some(c => n.includes(c))) return String(row[k] || '').trim();
  }
  return '';
}

// Parse Excel date serial or string → YYYY-MM-DD
export function parseExcelDate(raw) {
  if (!raw) return '';
  if (!isNaN(Number(raw))) {
    const d = XLSX.SSF.parse_date_code(Number(raw));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return String(raw).trim();
}

// Read a File object → array of row objects
export function readSheetFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }));
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Download a worksheet as .xlsx
export function exportXlsx(headers, rows, sheetName, fileName) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

export const ROLE_LABELS = {
  admin: 'Admin', inward: 'Inward team', outward: 'Outward team',
  purchase: 'Purchase team', manager: 'Manager', viewer: 'Viewer',
};