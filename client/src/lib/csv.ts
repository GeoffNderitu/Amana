// Minimal, dependency-free CSV parser for bank/mobile-money statement exports.
// Runs entirely in the browser: the raw file is never sent to our server — see
// pages/Import.tsx and the Privacy Policy section on statement imports.

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM if present (common in bank-exported CSVs).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

export interface ColumnGuess {
  dateCol: number;
  payeeCol: number;
  amountCol: number;
  hasHeader: boolean;
}

const DATE_HEADER_HINTS = ['date', 'transaction date', 'posted', 'value date'];
const PAYEE_HEADER_HINTS = ['description', 'payee', 'narrative', 'details', 'memo', 'particulars', 'merchant'];
const AMOUNT_HEADER_HINTS = ['amount', 'value', 'debit', 'withdrawal', 'money out'];

function looksLikeDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(s);
}
function looksLikeAmount(s: string): boolean {
  return /^-?\(?\$?\s?[\d,]+(\.\d{1,2})?\)?$/.test(s.trim());
}

// Guess which columns are date / payee / amount from a header row (by name) or, failing
// that, from the shape of the first couple of data rows. Users can always override this
// manually in the Import review screen before anything is sent to the server.
export function guessColumns(rows: string[][]): ColumnGuess | null {
  if (rows.length === 0) return null;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const findHeader = (hints: string[]) => header.findIndex((h) => hints.some((hint) => h.includes(hint)));

  const dateCol = findHeader(DATE_HEADER_HINTS);
  const payeeCol = findHeader(PAYEE_HEADER_HINTS);
  const amountCol = findHeader(AMOUNT_HEADER_HINTS);
  if (dateCol >= 0 && payeeCol >= 0 && amountCol >= 0) {
    return { dateCol, payeeCol, amountCol, hasHeader: true };
  }

  // Fallback: inspect the first data row's column shapes.
  const sample = rows.find((r) => r.length >= 3) || rows[0];
  const ncols = sample.length;
  let dc = -1;
  let ac = -1;
  for (let i = 0; i < ncols; i++) {
    if (dc === -1 && looksLikeDate(sample[i])) dc = i;
    if (ac === -1 && looksLikeAmount(sample[i]) && i !== dc) ac = i;
  }
  if (dc >= 0 && ac >= 0) {
    const pc = [...Array(ncols).keys()].find((i) => i !== dc && i !== ac) ?? Math.max(0, dc === 0 ? 1 : 0);
    return { dateCol: dc, payeeCol: pc, amountCol: ac, hasHeader: false };
  }
  return null;
}

export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // Ambiguous day/month order — assume DD/MM/YYYY (common outside the US); if the
    // first part is >12 it must be the day either way.
    let day = a.padStart(2, '0');
    let month = b.padStart(2, '0');
    if (Number(a) > 12) {
      day = a.padStart(2, '0');
      month = b.padStart(2, '0');
    } else if (Number(b) > 12) {
      day = b.padStart(2, '0');
      month = a.padStart(2, '0');
    }
    return `${y}-${month}-${day}`;
  }
  return null;
}

export function normalizeAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()$,\s]/g, '').replace(/^-/, '');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}
