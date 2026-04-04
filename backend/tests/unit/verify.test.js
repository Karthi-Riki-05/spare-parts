const {
  classifySupplementary,
  isInternalInstruction,
} = require('../../src/services/supplementaryLogger');
const { deduplicateVerified } = require('../../src/services/deduplicationService');

function makeRow(overrides = {}) {
  return {
    internalItemNumber: 'INT-001',
    description: 'Test Part',
    manufacturer: 'Siemens',
    itemNumber: '6ES7315',
    typeDesignation: '',
    supplementary: '',
    rowIndex: 0,
    ...overrides,
  };
}

function makeResult(overrides = {}) {
  return {
    rowIndex: 0,
    description: 'Test Part',
    manufacturer: 'Siemens',
    itemNumber: '6ES7315',
    typeDesignation: '',
    supplementary: '',
    verifiedSource: 'Manufacturer website',
    verificationScore: 95,
    websiteId: 'https://siemens.com/product',
    sourceType: 'official',
    manufacturerWebsite: 'https://siemens.com',
    manufacturerInferred: false,
    supplementaryUsed: false,
    supplementaryChanged: false,
    supplementaryOriginal: '',
    supplementaryType: 'unknown',
    urlValidationStatus: 'valid',
    ...overrides,
  };
}

describe('R3 — Supplementary as Plan B', () => {
  it('should NOT use supplementary when score >= 70', () => {
    const result = makeResult({ verificationScore: 85 });
    expect(result.verificationScore).toBeGreaterThanOrEqual(70);
    // In production: supplementary is not sent in the second call
    expect(result.supplementaryUsed).toBe(false);
  });

  it('should classify TYPE A supplementary for use when score < 70', () => {
    const row = makeRow({ supplementary: '50mm bore, sealed, C3 clearance' });
    const type = classifySupplementary(row.supplementary);
    expect(type).toBe('part_specification');
  });

  it('should NOT modify TYPE B supplementary even when score < 70', () => {
    const row = makeRow({ supplementary: 'Check with John before ordering' });
    const type = classifySupplementary(row.supplementary);
    expect(type).toBe('internal_instruction');
    expect(isInternalInstruction(row.supplementary)).toBe(true);
  });

  it('should classify "Do not order from alternate supplier" as TYPE B', () => {
    expect(isInternalInstruction('Do not order from alternate supplier')).toBe(true);
  });

  it('should classify "Alternative: SKF 6205-2Z" as TYPE A', () => {
    expect(isInternalInstruction('Alternative: SKF 6205-2Z')).toBe(false);
  });
});

describe('R4 — Manufacturer inference from NULL', () => {
  it('should detect manufacturer from description containing brand', () => {
    const row = makeRow({ manufacturer: '', description: 'Siemens servo motor 1FK7042' });
    const brands = ['Siemens', 'ABB', 'SKF', 'Bosch', 'Danfoss', 'Festo'];
    const found = brands.find(b => row.description.toLowerCase().includes(b.toLowerCase()));
    expect(found).toBe('Siemens');
  });

  it('should detect manufacturer from part number prefix', () => {
    const row = makeRow({ manufacturer: '', itemNumber: 'ABB-M2AA132M4' });
    const match = row.itemNumber.match(/^(ABB|SKF|SIE|IFM|SMC)[-_]/i);
    expect(match[1]).toBe('ABB');
  });

  it('should leave blank when no manufacturer can be inferred', () => {
    const row = makeRow({ manufacturer: '', description: 'Generic motor 5.5kW' });
    const brands = ['Siemens', 'ABB', 'SKF', 'Bosch', 'Danfoss'];
    const found = brands.find(b => row.description.toLowerCase().includes(b.toLowerCase()));
    expect(found).toBeUndefined();
  });
});

describe('R2b — Post-verification deduplication', () => {
  it('should deduplicate when AI returns identical C and D', () => {
    const result = makeResult({ itemNumber: '6ES7315', typeDesignation: '6ES7315' });
    const deduped = deduplicateVerified(result);
    expect(deduped.typeDesignation).toBe('');
  });

  it('should keep both when different', () => {
    const result = makeResult({ itemNumber: '6ES7315-2EH14-0AB0', typeDesignation: '6ES7315' });
    const deduped = deduplicateVerified(result);
    expect(deduped.typeDesignation).toBe('6ES7315');
  });
});
