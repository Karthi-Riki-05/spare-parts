const ExcelJS = require('exceljs');

const METADATA_PATTERNS = [
  /^s[ai]mple data/i,
  /^sample data/i,
  /^item number\s*[\n(]/i,
  /company'?s?\s*\(item owner/i,
  /categorizing name for/i,
  /manufacturer\/make\/brand/i,
  /^explanation/i,
  /^column\s*(header|definition)/i,
];

function isMetadataRow(rowValues) {
  const firstCell = String(rowValues[0] || '').trim();
  if (!firstCell) return false;
  if (METADATA_PATTERNS.some(p => p.test(firstCell))) return true;
  if (firstCell.includes('\n\n')) return true;
  return false;
}

/**
 * Extract the short display label from a full column header.
 * Headers often contain descriptions after double-spaces:
 *   "Item number  Company's (item owner's) internal..." → "Item number"
 */
function extractShortLabel(fullHeader) {
  if (!fullHeader) return '';
  const str = String(fullHeader).trim();
  const parts = str.split(/\s{2,}/);
  return parts[0].trim();
}

/**
 * Case-insensitive header dedup. Some source files contain two columns with
 * the same label in different casing (e.g. "Supplementary information" and
 * "Supplementary Information"). We keep the FIRST occurrence's original
 * casing and suffix subsequent duplicates with the column index so they
 * remain distinguishable in exports and don't collide in downstream code.
 */
function deduplicateHeaders(headers) {
  const seen = new Map();
  const out = {};
  for (const [colKey, label] of Object.entries(headers)) {
    const norm = String(label || '').trim().toLowerCase();
    if (!norm) { out[colKey] = label; continue; }
    if (seen.has(norm)) {
      const idx = Number(colKey.replace('col_', '')) || 0;
      out[colKey] = `${label} (${idx + 1})`;
    } else {
      seen.set(norm, colKey);
      out[colKey] = label;
    }
  }
  return out;
}

async function readExcelFromBase64(base64, sheetIndex) {
  const buffer = Buffer.from(base64, 'base64');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames = workbook.worksheets.map(s => s.name);
  const sheet = workbook.worksheets[sheetIndex];
  if (!sheet) throw new Error(`Sheet index ${sheetIndex} not found`);

  // Extract original column headers — scan first 5 rows to find the header row.
  // The header row is the first row with 3+ non-empty cells that look like column names.
  let originalHeaders = null;
  for (let rowNum = 1; rowNum <= Math.min(5, sheet.rowCount); rowNum++) {
    const candidateRow = sheet.getRow(rowNum);
    if (!candidateRow || candidateRow.cellCount < 3) continue;

    const candidate = {};
    let nonEmpty = 0;
    candidateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = cell.text != null ? cell.text : (cell.value != null ? String(cell.value) : '');
      if (raw.trim()) {
        candidate[`col_${colNumber - 1}`] = extractShortLabel(raw);
        nonEmpty++;
      }
    });

    // A header row has 3+ columns and cells are short text (not data values like part numbers)
    if (nonEmpty >= 3) {
      const avgLen = Object.values(candidate).reduce((s, v) => s + String(v).length, 0) / nonEmpty;
      // Headers are typically short labels (< 50 chars avg); skip rows of long data
      if (avgLen < 50) {
        originalHeaders = candidate;
        break;
      }
    }
  }
  if (originalHeaders && Object.keys(originalHeaders).length === 0) originalHeaders = null;
  if (originalHeaders) originalHeaders = deduplicateHeaders(originalHeaders);

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= 1) return;
    const rowData = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      rowData[`col_${colNumber - 1}`] = cell.text != null ? cell.text : cell.value;
    });
    const values = Object.values(rowData).map(v => String(v || ''));
    if (isMetadataRow(values)) return;
    rows.push(rowData);
  });
  return { rows, sheetNames, originalHeaders };
}

async function getSheetNames(base64) {
  const buffer = Buffer.from(base64, 'base64');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map(s => s.name);
}

function applyHeaderStyle(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFC8CDD5' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyTealHeaderStyle(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyGreyHeaderStyle(sheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FF111827' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function truncate(str, max) {
  const s = String(str || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function applyScoreFill(cell, score) {
  let argb = null;
  if (score >= 90) argb = 'FFD1FAE5';        // green
  else if (score >= 70) argb = 'FFFEF3C7';   // yellow
  else if (score >= 50) argb = 'FFFED7AA';   // orange
  else argb = 'FFFEE2E2';                    // red (incl. 0)
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  cell.alignment = { horizontal: 'center' };
}

function setHyperlinkCell(cell, url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    cell.value = url ? String(url) : '—';
    cell.alignment = { wrapText: false, vertical: 'middle' };
    return;
  }
  // Full URL as both display text and hyperlink target — never truncate the
  // visible text, otherwise users see "…" in Excel and have to check the
  // formula bar to read the real URL.
  cell.value = { text: url, hyperlink: url };
  cell.font = { color: { argb: 'FF0066CC' }, underline: true };
  cell.alignment = { wrapText: false, vertical: 'middle' };
}

function setSourceTypeCell(cell, sourceType) {
  const st = String(sourceType || '').toLowerCase();
  cell.value = sourceType || '';
  if (st === 'official') cell.font = { color: { argb: 'FF059669' }, bold: true };          // green
  else if (st === 'external' || st === 'distributor') cell.font = { color: { argb: 'FF2563EB' }, bold: true }; // blue
  else cell.font = { color: { argb: 'FF6B7280' } };                                        // grey
}

/**
 * Build the Original Data sheet from raw input rows.
 * Accepts either NormalizedRow shape (camelCase fields) or raw col_N rows.
 */
function buildOriginalDataSheet(sheet, originalData, originalHeaders) {
  const h = originalHeaders || {};
  sheet.columns = [
    { header: h.col_0 || 'Internal Item #',                   key: 'internalItemNumber', width: 18 },
    { header: h.col_1 || 'Description',                       key: 'description',        width: 32 },
    { header: h.col_2 || 'Manufacturer',                      key: 'manufacturer',       width: 20 },
    { header: h.col_3 || "Manufacturer's Item #",             key: 'itemNumber',         width: 22 },
    { header: h.col_4 || "Manufacturer's Type Designation",   key: 'typeDesignation',    width: 26 },
    { header: h.col_5 || 'Supplementary Information',         key: 'supplementary',      width: 30 },
  ];
  applyGreyHeaderStyle(sheet);

  if (!Array.isArray(originalData) || originalData.length === 0) return;

  for (const row of originalData) {
    // Prefer camelCase (NormalizedRow); fall back to col_N for raw Excel rows.
    sheet.addRow({
      internalItemNumber: row.internalItemNumber ?? row.col_0 ?? '',
      description:        row.description        ?? row.col_1 ?? '',
      manufacturer:       row.manufacturer       ?? row.col_2 ?? '',
      itemNumber:         row.itemNumber         ?? row.col_3 ?? '',
      typeDesignation:    row.typeDesignation    ?? row.col_4 ?? '',
      supplementary:      row.supplementary      ?? row.col_5 ?? '',
    });
  }
}

/**
 * Import Ready — 10 fixed columns, one field per cell, score color-coded,
 * Website ID as a clickable hyperlink, Source Type color-coded text.
 */
function buildImportReadySheet(sheet, results, originalHeaders) {
  const h = originalHeaders || {};
  sheet.columns = [
    { header: h.col_0 || 'Internal Item #',                   key: 'internalItemNumber', width: 15 },
    { header: h.col_1 || 'Description',                       key: 'description',        width: 30 },
    { header: h.col_2 || 'Manufacturer',                      key: 'manufacturer',       width: 20 },
    { header: h.col_3 || "Manufacturer's Item Number",        key: 'itemNumber',         width: 20 },
    { header: h.col_4 || "Manufacturer's Type Designation",   key: 'typeDesignation',    width: 25 },
    { header: h.col_5 || 'Supplementary Information',         key: 'supplementary',      width: 30 },
    { header: 'Verified Source',                   key: 'verifiedSource',     width: 25 },
    { header: 'Verification Score',                key: 'verificationScore',  width: 10 },
    { header: 'Website ID',                        key: 'websiteId',          width: 80 },
    { header: 'Source Type',                       key: 'sourceType',         width: 15 },
  ];
  applyTealHeaderStyle(sheet);

  for (const row of results) {
    const excelRow = sheet.addRow({
      internalItemNumber: row.internalItemNumber || '',
      description:        row.description        || '',
      manufacturer:       row.manufacturer       || '',
      itemNumber:         row.itemNumber         || '',
      typeDesignation:    row.typeDesignation    || '',
      supplementary:      row.supplementary      || '',
      verifiedSource:     row.verifiedSource     || '',
      verificationScore:  row.verificationScore  ?? 0,
      websiteId:          '',   // set below as hyperlink
      sourceType:         '',   // set below color-coded
    });

    applyScoreFill(excelRow.getCell('verificationScore'), row.verificationScore || 0);
    setHyperlinkCell(excelRow.getCell('websiteId'), row.websiteId);
    setSourceTypeCell(excelRow.getCell('sourceType'), row.sourceType);
  }
}

async function buildVerifiedExcel(results, originalData, _originalFormat, originalHeaders) {
  const h = originalHeaders || {};
  const workbook = new ExcelJS.Workbook();

  // -------- Sheet 1: Verified Data --------
  const sheet1 = workbook.addWorksheet('Verified Data');
  sheet1.columns = [
    { header: h.col_0 || 'Internal Item Number',              key: 'internalItemNumber', width: 20 },
    { header: h.col_1 || 'Description',                       key: 'description',        width: 30 },
    { header: h.col_2 || 'Manufacturer',                      key: 'manufacturer',       width: 20 },
    { header: h.col_3 || "Manufacturer's Item Number",        key: 'itemNumber',         width: 25 },
    { header: h.col_4 || "Manufacturer's Type Designation",   key: 'typeDesignation',    width: 25 },
    { header: h.col_5 || 'Supplementary Information',         key: 'supplementary',      width: 30 },
    { header: h.col_6 || 'Spare Part Category',               key: 'sparePartCategory',  width: 20 },
    { header: 'Verified Source',                   key: 'verifiedSource',     width: 25 },
    { header: 'Verification Score',                key: 'verificationScore',  width: 18 },
    { header: 'Website ID',                        key: 'websiteId',          width: 80 },
    { header: 'Source Type',                       key: 'sourceType',         width: 15 },
  ];
  applyHeaderStyle(sheet1);

  for (const row of results) {
    const data = { ...row, sparePartCategory: row.sparePartCategory || '', websiteId: '', sourceType: '' };
    const r = sheet1.addRow(data);
    const score = row.verificationScore || 0;
    const scoreCell = r.getCell('verificationScore');
    if (score >= 90) scoreCell.font = { color: { argb: 'FF34D399' } };
    else if (score >= 70) scoreCell.font = { color: { argb: 'FFFBBF24' } };
    else if (score >= 50) scoreCell.font = { color: { argb: 'FFF97316' } };
    else if (score > 0) scoreCell.font = { color: { argb: 'FFEF4444' } };

    setHyperlinkCell(r.getCell('websiteId'), row.websiteId);
    setSourceTypeCell(r.getCell('sourceType'), row.sourceType);
  }

  // -------- Sheet 2: Original Data --------
  const sheet2 = workbook.addWorksheet('Original Data');
  buildOriginalDataSheet(sheet2, originalData, originalHeaders);

  // -------- Sheet 3: Import Ready (10 columns, one field per cell) --------
  const sheet3 = workbook.addWorksheet('Import Ready');
  buildImportReadySheet(sheet3, results, originalHeaders);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { readExcelFromBase64, getSheetNames, buildVerifiedExcel };
