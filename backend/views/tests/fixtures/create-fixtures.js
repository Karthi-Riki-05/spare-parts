const ExcelJS = require('exceljs');
const path = require('path');

async function createAll() {
  // Company A
  let wb = new ExcelJS.Workbook(), s = wb.addWorksheet('Parts List');
  s.addRow(['Internal Item No','Description','Manufacturer','Item Number','Type Designation','Supplementary']);
  s.addRow(['INT-001','SIMATIC S7-300 CPU Module','Siemens','6ES7315-2EH14-0AB0','6ES7315-2EH14-0AB0','For PLC rack assembly']);
  s.addRow(['INT-002','Deep groove ball bearing','SKF','6205-2RS1','','Sealed, both sides']);
  s.addRow(['INT-003','AC Motor 5.5kW','ABB','M2AA132M4','M2AA 132 M4','']);
  s.addRow(['INT-004','Frequency converter','Danfoss','FC-302P5K5T5','','Check with John before ordering']);
  s.addRow(['INT-005','Proximity sensor inductive','IFM','IF5250','IFS204','']);
  await wb.xlsx.writeFile(path.join(__dirname, 'company-a-sample.xlsx'));

  wb = new ExcelJS.Workbook(); s = wb.addWorksheet('Parts');
  s.addRow(['Item No','Part Data']);
  s.addRow(['B-001','Spårkullager SKF 62304-2RS1 Tätat Artnr:623042RS']);
  s.addRow(['B-002','Cylinderlager SKF NU 205 ECP Öppet Art.nr:NU205ECP']);
  s.addRow(['B-003','Motor ABB M2AA 90L4 1.5kW 1500rpm']);
  s.addRow(['B-004','Ventil Bosch Rexroth 4WE6D62/EG24N9K4 ERS. 4WE6D51/AG24NZ4']);
  s.addRow(['B-005','Pump Atlas Copco GA 30+ Ref:8152930000']);
  await wb.xlsx.writeFile(path.join(__dirname, 'company-b-sample.xlsx'));

  wb = new ExcelJS.Workbook(); s = wb.addWorksheet('Spare Parts');
  s.addRow(['Ref','Description','Part Number','Notes']);
  s.addRow(['C-001','Siemens servo motor','1FK7042-5AK71-1DG5','']);
  s.addRow(['C-002','Ball bearing sealed','6208-2Z','']);
  s.addRow(['C-003','ABB contactor 3-pole','A9-30-10','Internal use only']);
  s.addRow(['C-004','Pneumatic cylinder','DSBC-50-100-PPVA-N3','Festo standard']);
  s.addRow(['C-005','Encoder incremental','ERN 1387 2048','Heidenhain']);
  await wb.xlsx.writeFile(path.join(__dirname, 'company-c-sample.xlsx'));

  wb = new ExcelJS.Workbook();
  s = wb.addWorksheet('Parts List'); s.addRow(['Item No','Description','Manufacturer','Part Number']); s.addRow(['MS-001','PLC Module','Siemens','6ES7315']); s.addRow(['MS-002','Bearing','SKF','6205']);
  wb.addWorksheet('Summary').addRow(['Total',2]);
  await wb.xlsx.writeFile(path.join(__dirname, 'multi-sheet-sample.xlsx'));

  console.log('All fixtures created.');
}
createAll().catch(console.error);
