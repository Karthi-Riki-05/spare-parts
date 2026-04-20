/**
 * Verifies duplicate-supplementary-column dedup on Excel read (Issue 2).
 *
 * Scenario: the source file has BOTH "Supplementary information" (lowercase i)
 * and "Supplementary Information" (uppercase I). Before the fix, both got
 * stored as-is and a downstream case-insensitive find would pick whichever
 * iterated first — later exports then wrote two columns.
 *
 * After the fix, the second occurrence is suffixed with its column index so
 * consumers see a clear disambiguation instead of a silent collision.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://test:test@localhost:5433/spareparts_test';
process.env.LOG_LEVEL = 'error';
process.env.GEMINI_API_KEY = 'test-key';

const ExcelJS = require('exceljs');
const { readExcelFromBase64 } = require('../../src/services/excelService');

async function buildXlsxBase64(headers, dataRow) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow(headers);
  sheet.addRow(dataRow);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

describe('excelService.readExcelFromBase64 — header dedup (Issue 2)', () => {
  it('deduplicates two supplementary headers with different casing', async () => {
    const b64 = await buildXlsxBase64(
      [
        'Item Number',
        'Description',
        'Manufacturer',
        "Manufacturer's Item Number",
        "Manufacturer's Type Designation",
        'Supplementary information',   // lowercase i — first
        'Supplementary Information',   // uppercase I — duplicate
      ],
      ['INT-001', 'Ball bearing', 'SKF', '6205', '6205', 'note A', 'note B'],
    );

    const { originalHeaders } = await readExcelFromBase64(b64, 0);

    expect(originalHeaders).toBeTruthy();
    // First occurrence keeps original casing
    expect(originalHeaders.col_5).toBe('Supplementary information');
    // Second is suffixed with its 1-based column index so it stays distinguishable
    expect(originalHeaders.col_6).toMatch(/^Supplementary Information \(\d+\)$/);
  });

  it('leaves non-duplicate headers untouched', async () => {
    const b64 = await buildXlsxBase64(
      ['Item Number', 'Description', 'Manufacturer', "Item #", "Type", 'Supplementary information'],
      ['INT-001', 'Bearing', 'SKF', '6205', '6205', 'note'],
    );
    const { originalHeaders } = await readExcelFromBase64(b64, 0);
    expect(originalHeaders.col_5).toBe('Supplementary information');
    // No suffixes added when there are no duplicates
    for (const v of Object.values(originalHeaders)) {
      expect(String(v)).not.toMatch(/\(\d+\)$/);
    }
  });
});
