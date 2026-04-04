const { deduplicateOriginal, deduplicateVerified, normalizeCanonicalField, applyAllDeduplication } = require('../../src/services/deduplicationService');

const makeRow = (o = {}) => ({ internalItemNumber: 'INT-001', description: 'Test', manufacturer: 'TestCo', itemNumber: '', typeDesignation: '', supplementary: '', rowIndex: 0, ...o });

describe('deduplicateOriginal (R2a)', () => {
  it('identical C and D → keep C, empty D', () => { const r = deduplicateOriginal(makeRow({ itemNumber: 'ABC123', typeDesignation: 'ABC123' })); expect(r.itemNumber).toBe('ABC123'); expect(r.typeDesignation).toBe(''); });
  it('case-insensitive', () => { expect(deduplicateOriginal(makeRow({ itemNumber: 'ABC123', typeDesignation: 'abc123' })).typeDesignation).toBe(''); });
  it('trimmed', () => { expect(deduplicateOriginal(makeRow({ itemNumber: 'ABC123 ', typeDesignation: ' ABC123' })).typeDesignation).toBe(''); });
  it('different → keep both', () => { expect(deduplicateOriginal(makeRow({ itemNumber: 'ABC', typeDesignation: 'XYZ' })).typeDesignation).toBe('XYZ'); });
  it('one empty → no change', () => { expect(deduplicateOriginal(makeRow({ itemNumber: 'ABC', typeDesignation: '' })).itemNumber).toBe('ABC'); });
});

describe('deduplicateVerified (R2b)', () => {
  it('deduplicates identical', () => { expect(deduplicateVerified({ itemNumber: '6ES7315', typeDesignation: '6ES7315' }).typeDesignation).toBe(''); });
  it('case-insensitive', () => { expect(deduplicateVerified({ itemNumber: 'SKF-6205', typeDesignation: 'skf-6205' }).typeDesignation).toBe(''); });
});

describe('normalizeCanonicalField', () => {
  it('moves D to C when C empty', () => { const r = normalizeCanonicalField(makeRow({ itemNumber: '', typeDesignation: 'XYZ' })); expect(r.itemNumber).toBe('XYZ'); expect(r.typeDesignation).toBe(''); });
  it('no move when C has value', () => { expect(normalizeCanonicalField(makeRow({ itemNumber: 'ABC', typeDesignation: 'XYZ' })).itemNumber).toBe('ABC'); });
});

describe('applyAllDeduplication', () => {
  it('normalizes then deduplicates', () => { const r = applyAllDeduplication(makeRow({ itemNumber: '', typeDesignation: 'ABC123' })); expect(r.itemNumber).toBe('ABC123'); expect(r.typeDesignation).toBe(''); });
});
