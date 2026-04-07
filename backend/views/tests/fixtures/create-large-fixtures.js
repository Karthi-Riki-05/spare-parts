const ExcelJS = require('exceljs');
const path = require('path');

const MANUFACTURERS = ['Siemens', 'ABB', 'SKF', 'Bosch Rexroth', 'IFM', 'Festo', 'Danfoss', 'Atlas Copco'];
const DESCRIPTIONS = ['PLC Module', 'Ball Bearing', 'AC Motor', 'Frequency Converter', 'Proximity Sensor', 'Pneumatic Cylinder', 'Servo Motor', 'Contactor'];

function makeRow(i) {
  const mfr = MANUFACTURERS[i % MANUFACTURERS.length];
  const desc = DESCRIPTIONS[i % DESCRIPTIONS.length];
  return [`INT-${1000 + i}`, `${desc} ${mfr}`, mfr, `PN-${100000 + i}`, '', ''];
}

async function createLargeFixtures() {
  // 1,100 rows — triggers R22 large-file progress
  let wb = new ExcelJS.Workbook();
  let s = wb.addWorksheet('Parts List');
  s.addRow(['Internal Item No', 'Description', 'Manufacturer', 'Item Number', 'Type Designation', 'Supplementary']);
  for (let i = 0; i < 1100; i++) s.addRow(makeRow(i));
  await wb.xlsx.writeFile(path.join(__dirname, 'large-sample.xlsx'));
  console.log('large-sample.xlsx created (1,100 rows)');

  // 5,100 rows — triggers R23 warning dialog
  wb = new ExcelJS.Workbook();
  s = wb.addWorksheet('Parts List');
  s.addRow(['Internal Item No', 'Description', 'Manufacturer', 'Item Number', 'Type Designation', 'Supplementary']);
  for (let i = 0; i < 5100; i++) s.addRow(makeRow(i));
  await wb.xlsx.writeFile(path.join(__dirname, 'huge-sample.xlsx'));
  console.log('huge-sample.xlsx created (5,100 rows)');
}

createLargeFixtures().catch(console.error);
