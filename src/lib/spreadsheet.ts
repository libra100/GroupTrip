import { format, isValid } from 'date-fns';
import Papa from 'papaparse';
import readXlsxFile, { type Row } from 'read-excel-file/browser';

export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_MEDIA_BYTES = 18 * 1024 * 1024; // 18 MB
export const MAX_SPREADSHEET_ROWS = 2000;

export type AllowedFileSignatureKind = 'xlsx' | 'csv' | 'text' | 'pdf' | 'image';

async function readHeadBytes(file: File, byteCount: number): Promise<Uint8Array> {
  const slice = file.slice(0, Math.min(file.size, byteCount));
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

function matchesPrefix(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, idx) => bytes[idx] === byte);
}

function isSupportedImageSignature(bytes: Uint8Array): boolean {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matchesPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true;
  // JPEG: FF D8 FF
  if (matchesPrefix(bytes, [0xff, 0xd8, 0xff])) return true;
  // GIF87a / GIF89a
  if (matchesPrefix(bytes, [0x47, 0x49, 0x46, 0x38])) return true;
  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    matchesPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  // HEIC / HEIF / AVIF (ISO Base Media File Format: ....ftyp)
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }
  return false;
}

export async function validateFileSignature(
  file: File,
  kind: AllowedFileSignatureKind
): Promise<void> {
  const maxBytes =
    kind === 'xlsx' || kind === 'csv'
      ? MAX_SPREADSHEET_BYTES
      : kind === 'text'
        ? MAX_TEXT_BYTES
        : MAX_MEDIA_BYTES;

  if (file.size === 0) {
    throw new Error(`檔案「${file.name}」為空檔案，請重新選擇有效檔案。`);
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`檔案「${file.name}」超過 ${maxMb}MB 上限，請縮減檔案後重試。`);
  }

  if (kind === 'xlsx') {
    const head = await readHeadBytes(file, 16);
    if (!matchesPrefix(head, [0x50, 0x4b, 0x03, 0x04])) {
      throw new Error(`檔案「${file.name}」不是有效的 .xlsx（OOXML ZIP 檔頭驗證失敗）。`);
    }
    return;
  }

  if (kind === 'pdf') {
    const head = await readHeadBytes(file, 16);
    if (!matchesPrefix(head, [0x25, 0x50, 0x44, 0x46])) {
      throw new Error(`檔案「${file.name}」不是有效的 PDF 檔案（%PDF 檔頭驗證失敗）。`);
    }
    return;
  }

  if (kind === 'image') {
    const head = await readHeadBytes(file, 16);
    if (!isSupportedImageSignature(head)) {
      throw new Error(`檔案「${file.name}」不是受支援的圖片格式（僅支援 JPG、PNG、WEBP、GIF、HEIC）。`);
    }
    return;
  }

  // 'csv' | 'text': ensure no NUL bytes appear in leading chunk (reject binary masquerading as text)
  const head = await readHeadBytes(file, 4096);
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0x00) {
      throw new Error(`檔案「${file.name}」包含二進位內容，無法作為純文字／CSV 匯入。`);
    }
  }
}

function formatCellValue(cell: Row[number]): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) {
    if (!isValid(cell)) return '';
    const hasTime =
      cell.getHours() !== 0 || cell.getMinutes() !== 0 || cell.getSeconds() !== 0;
    return format(cell, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return String(cell).trim();
}

export async function parseSpreadsheetToRows(file: File): Promise<Record<string, unknown>[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xls')) {
    throw new Error('基於安全與相容性考量，已停用舊版二進位 .xls 格式，請先另存為 .xlsx 或 .csv 後再匯入。');
  }

  if (lowerName.endsWith('.csv')) {
    await validateFileSignature(file, 'csv');
    const rawText = (await file.text()).replace(/^\uFEFF/, '');
    const parsed = Papa.parse<Record<string, unknown>>(rawText, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    const dataRows = parsed.data || [];
    if (dataRows.length > MAX_SPREADSHEET_ROWS) {
      throw new Error(`試算表資料超過 ${MAX_SPREADSHEET_ROWS} 列上限，請分批匯入。`);
    }
    return dataRows;
  }

  if (lowerName.endsWith('.xlsx')) {
    await validateFileSignature(file, 'xlsx');
    const sheets = await readXlsxFile(file);
    const firstSheet = sheets[0];
    if (!firstSheet || firstSheet.data.length === 0) return [];

    if (firstSheet.data.length > MAX_SPREADSHEET_ROWS + 1) {
      throw new Error(`試算表資料超過 ${MAX_SPREADSHEET_ROWS} 列上限，請分批匯入。`);
    }

    const headerRow = firstSheet.data[0] || [];
    const headers = headerRow.map((cell, idx) => {
      const cleaned = formatCellValue(cell).replace(/^\uFEFF/, '');
      return cleaned || `column_${idx}`;
    });

    const rows: Record<string, unknown>[] = [];
    for (let r = 1; r < firstSheet.data.length; r++) {
      const rawRow = firstSheet.data[r];
      if (!rawRow || rawRow.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue;
      }
      const record: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        record[header] = formatCellValue(rawRow[idx]);
      });
      rows.push(record);
    }

    return rows;
  }

  throw new Error('不支援的試算表格式，請上傳 .xlsx 或 .csv 檔案。');
}

export async function parseSpreadsheetToText(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.xls')) {
    throw new Error('基於安全考量，已停用舊版二進位 .xls 格式，請先另存為 .xlsx 或 .csv 後再上傳。');
  }

  if (lowerName.endsWith('.csv')) {
    await validateFileSignature(file, 'csv');
    const rawText = (await file.text()).replace(/^\uFEFF/, '');
    const parsed = Papa.parse<string[]>(rawText, {
      skipEmptyLines: 'greedy',
    });
    const rows = parsed.data || [];
    if (rows.length > MAX_SPREADSHEET_ROWS) {
      throw new Error(`CSV 檔案超過 ${MAX_SPREADSHEET_ROWS} 列上限，請精簡後再上傳。`);
    }
    const normalizedCsv = Papa.unparse(rows);
    return `【試算表檔案：${file.name}】\n${normalizedCsv}`;
  }

  if (lowerName.endsWith('.xlsx')) {
    await validateFileSignature(file, 'xlsx');
    const sheets = await readXlsxFile(file);
    let totalRows = 0;

    const sheetsText = sheets
      .map((sheet) => {
        totalRows += sheet.data.length;
        if (totalRows > MAX_SPREADSHEET_ROWS) {
          throw new Error(`Excel 工作表總列數超過 ${MAX_SPREADSHEET_ROWS} 列上限，請精簡後再上傳。`);
        }
        const stringRows = sheet.data.map((row) => row.map((cell) => formatCellValue(cell)));
        const csv = Papa.unparse(stringRows);
        return `--- 工作表: ${sheet.sheet} ---\n${csv}`;
      })
      .join('\n\n');

    return `【試算表檔案：${file.name}】\n${sheetsText}`;
  }

  throw new Error('不支援的試算表格式，請上傳 .xlsx 或 .csv 檔案。');
}
