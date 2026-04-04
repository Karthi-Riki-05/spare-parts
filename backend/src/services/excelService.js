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

async function readExcelFromBase64(base64, sheetIndex) {
  const buffer = Buffer.from(base64, 'base64');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetNames = workbook.worksheets.map(s => s.name);
  const sheet = workbook.worksheets[sheetIndex];
  if (!sheet) throw new Error(`Sheet index ${sheetIndex} not found`);
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // Always skip row 1 (sheet title/annotation) and row 2 (column definitions) if they exist
    if (rowNumber <= 1) return;
    const rowData = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      rowData[`col_${colNumber - 1}`] = cell.text != null ? cell.text : cell.value;
    });
    const values = Object.values(rowData).map(v => String(v || ''));
    if (isMetadataRow(values)) return;
    rows.push(rowData);
  });
  return { rows, sheetNames };
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

async function buildVerifiedExcel(results, originalData, originalFormat) {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Verified Data
  const sheet1 = workbook.addWorksheet('Verified Data');
  sheet1.columns = [
    { header: 'Internal Item Number', key: 'internalItemNumber', width: 20 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Manufacturer', key: 'manufacturer', width: 20 },
    { header: "Manufacturer's Item Number", key: 'itemNumber', width: 25 },
    { header: "Manufacturer's Type Designation", key: 'typeDesignation', width: 25 },
    { header: 'Supplementary Information', key: 'supplementary', width: 30 },
    { header: 'Spare Part Category', key: 'sparePartCategory', width: 20 },
    { header: 'Verified Source', key: 'verifiedSource', width: 25 },
    { header: 'Verification Score', key: 'verificationScore', width: 18 },
    { header: 'Website ID', key: 'websiteId', width: 50 },
    { header: 'Source Type', key: 'sourceType', width: 15 },
  ];
  applyHeaderStyle(sheet1);

  for (const row of results) {
    const data = { ...row, sparePartCategory: row.sparePartCategory || '' };
    const r = sheet1.addRow(data);
    const score = row.verificationScore || 0;
    const scoreCell = r.getCell('verificationScore');
    if (score >= 90) scoreCell.font = { color: { argb: 'FF34D399' } };
    else if (score >= 70) scoreCell.font = { color: { argb: 'FFFBBF24' } };
    else if (score >= 50) scoreCell.font = { color: { argb: 'FFF97316' } };
    else if (score > 0) scoreCell.font = { color: { argb: 'FFEF4444' } };
  }

  // Sheet 2: Original Data
  const sheet2 = workbook.addWorksheet('Original Data');
  if (originalData && originalData.length > 0) {
    const keys = Object.keys(originalData[0]);
    sheet2.addRow(keys);
    sheet2.getRow(1).font = { bold: true };
    for (const row of originalData) {
      sheet2.addRow(keys.map(k => row[k] != null ? row[k] : ''));
    }
  }

  // Sheet 3: Import Ready (format-specific)
  const sheet3 = workbook.addWorksheet('Import Ready');
  const format = originalFormat || 'A';

  if (format === 'B') {
    // Format B: 2 columns matching Company B ERP structure
    sheet3.columns = [
      { header: 'Item Number', key: 'itemNumber', width: 20 },
      { header: 'Description', key: 'description', width: 80 },
    ];
    applyHeaderStyle(sheet3);
    for (const row of results) {
      const parts = [row.description, row.manufacturer, row.itemNumber || row.typeDesignation].filter(Boolean);
      sheet3.addRow({ itemNumber: row.internalItemNumber, description: parts.join('  ') });
    }
  } else if (format === 'C') {
    // Format C: 5 columns (no Manufacturer's Item Number)
    sheet3.columns = [
      { header: 'Internal Item Number', key: 'internalItemNumber', width: 20 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Manufacturer', key: 'manufacturer', width: 20 },
      { header: "Manufacturer's Type Designation", key: 'typeDesignation', width: 25 },
      { header: 'Spare Part Category', key: 'sparePartCategory', width: 20 },
    ];
    applyHeaderStyle(sheet3);
    for (const row of results) {
      sheet3.addRow({
        internalItemNumber: row.internalItemNumber,
        description: row.description,
        manufacturer: row.manufacturer,
        typeDesignation: row.typeDesignation,
        sparePartCategory: row.sparePartCategory || '',
      });
    }
  } else {
    // Format A: 7 columns matching Company A ERP structure
    sheet3.columns = [
      { header: 'Internal Item Number', key: 'internalItemNumber', width: 20 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Manufacturer', key: 'manufacturer', width: 20 },
      { header: "Manufacturer's Item Number", key: 'itemNumber', width: 25 },
      { header: "Manufacturer's Type Designation", key: 'typeDesignation', width: 25 },
      { header: 'Supplementary Information', key: 'supplementary', width: 30 },
      { header: 'Spare Part Category', key: 'sparePartCategory', width: 20 },
    ];
    applyHeaderStyle(sheet3);
    for (const row of results) {
      sheet3.addRow({
        internalItemNumber: row.internalItemNumber,
        description: row.description,
        manufacturer: row.manufacturer,
        itemNumber: row.itemNumber,
        typeDesignation: row.typeDesignation,
        supplementary: row.supplementary,
        sparePartCategory: row.sparePartCategory || '',
      });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { readExcelFromBase64, getSheetNames, buildVerifiedExcel };
