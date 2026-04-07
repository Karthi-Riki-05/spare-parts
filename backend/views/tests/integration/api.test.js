const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app } = require('../../src/server');

const fixturesDir = path.join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  const filePath = path.join(fixturesDir, name);
  return fs.readFileSync(filePath).toString('base64');
}

let companyAData;
let companyBData;
let multiSheetData;

beforeAll(() => {
  companyAData = loadFixture('company-a-sample.xlsx');
  companyBData = loadFixture('company-b-sample.xlsx');
  multiSheetData = loadFixture('multi-sheet-sample.xlsx');
});

describe('GET /api/health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeTruthy();
    expect(res.body.version).toBe('1.0.0');
  });
});

describe('POST /api/get-sheets', () => {
  it('should return sheet names for multi-sheet file', async () => {
    const res = await request(app)
      .post('/api/get-sheets')
      .send({ fileData: multiSheetData });

    expect(res.status).toBe(200);
    expect(res.body.sheets).toHaveLength(2);
    expect(res.body.sheets[0].name).toBe('Parts List');
    expect(res.body.sheets[1].name).toBe('Summary');
  });

  it('should return 400 for missing fileData', async () => {
    const res = await request(app)
      .post('/api/get-sheets')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

describe('POST /api/detect-format', () => {
  it('should detect format and include rowCount for company-a-sample', async () => {
    const res = await request(app)
      .post('/api/detect-format')
      .send({ fileData: companyAData });

    expect(res.status).toBe(200);
    expect(res.body.format).toBeTruthy();
    expect(res.body.confidence).toBeGreaterThan(0);
    expect(res.body.suggestedMapping).toBeTruthy();
    expect(res.body.rowCount).toBeGreaterThan(0);
    expect(res.body.sheetIndex).toBe(0);
  });

  it('should return 400 for empty fileData', async () => {
    const res = await request(app)
      .post('/api/detect-format')
      .send({ fileData: '' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/normalize', () => {
  it('should normalize Format A rows from fileData', async () => {
    const res = await request(app)
      .post('/api/normalize')
      .send({ fileData: companyAData, format: 'A' });

    expect(res.status).toBe(200);
    expect(res.body.rows).toBeInstanceOf(Array);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.originalData).toBeInstanceOf(Array);
    expect(res.body.rows[0].internalItemNumber).toBeTruthy();
  });

  it('should return 400 for invalid format', async () => {
    const res = await request(app)
      .post('/api/normalize')
      .send({ fileData: companyAData, format: 'X' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/manual-map', () => {
  it('should apply custom column mapping from fileData', async () => {
    const mapping = {
      internalItemNumber: 'col_0',
      description: 'col_1',
      manufacturer: 'col_2',
      itemNumber: 'col_3',
      typeDesignation: 'col_4',
      supplementary: 'col_5',
    };

    const res = await request(app)
      .post('/api/manual-map')
      .send({ fileData: companyAData, mapping });

    expect(res.status).toBe(200);
    expect(res.body.rows).toBeInstanceOf(Array);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.originalData).toBeInstanceOf(Array);
  });
});

describe('POST /api/verify', () => {
  it('should return SSE stream for verification', async () => {
    const rows = [
      {
        internalItemNumber: 'INT-001',
        description: 'PLC Module',
        manufacturer: 'Siemens',
        itemNumber: '6ES7315-2EH14-0AB0',
        typeDesignation: '',
        supplementary: '',
        rowIndex: 0,
      },
    ];

    const res = await request(app)
      .post('/api/verify')
      .send({ rows })
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data:');
    expect(res.text).toContain('"type":"complete"');
  });
});

describe('POST /api/export', () => {
  it('should return Excel download', async () => {
    const results = [{
      rowIndex: 0,
      internalItemNumber: 'INT-001',
      description: 'PLC Module',
      manufacturer: 'Siemens',
      itemNumber: '6ES7315',
      typeDesignation: '',
      supplementary: '',
      verifiedSource: 'Manufacturer website',
      verificationScore: 95,
      websiteId: 'https://siemens.com',
      sourceType: 'official',
      manufacturerWebsite: 'https://siemens.com',
      manufacturerInferred: false,
      supplementaryUsed: false,
      supplementaryChanged: false,
      supplementaryOriginal: '',
      supplementaryType: 'unknown',
      urlValidationStatus: 'valid',
    }];
    const originalData = [{ col_0: 'INT-001', col_1: 'PLC Module', col_2: 'Siemens' }];

    const res = await request(app)
      .post('/api/export')
      .send({ results, originalData, fileName: 'test.xlsx' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheet');
    expect(res.headers['content-disposition']).toContain('verified_test.xlsx');
  });
});
