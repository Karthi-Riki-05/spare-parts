const { handleErsPrefix } = require('../../src/utils/ersHandler');

const makeRow = (o = {}) => ({
  internalItemNumber: '20045087', description: 'Part', manufacturer: 'Siemens',
  itemNumber: '', typeDesignation: '', supplementary: '', rowIndex: 0, ...o,
});

describe('handleErsPrefix', () => {
  it('extracts superseded part from typeDesignation', () => {
    const row = makeRow({ typeDesignation: '6ES7 953-8LL31-0AA0 ERS.6ES7 953-8LL20-0AA0' });
    const result = handleErsPrefix(row);
    expect(result.typeDesignation).toBe('6ES7 953-8LL31-0AA0');
    expect(result.supplementary).toBe('(supersedes: 6ES7 953-8LL20-0AA0)');
  });

  it('extracts superseded part from itemNumber', () => {
    const row = makeRow({ itemNumber: 'ABC-100 ERS.ABC-050' });
    const result = handleErsPrefix(row);
    expect(result.itemNumber).toBe('ABC-100');
    expect(result.supplementary).toBe('(supersedes: ABC-050)');
  });

  it('appends to existing supplementary', () => {
    const row = makeRow({ typeDesignation: 'WTB27-3P2461 ERS.WTB27-3P2441', supplementary: 'High temp rated' });
    const result = handleErsPrefix(row);
    expect(result.typeDesignation).toBe('WTB27-3P2461');
    expect(result.supplementary).toBe('High temp rated | (supersedes: WTB27-3P2441)');
  });

  it('does not modify rows without ERS.', () => {
    const row = makeRow({ itemNumber: 'R77-DRS71M4', typeDesignation: 'DRS71M4' });
    const result = handleErsPrefix(row);
    expect(result.itemNumber).toBe('R77-DRS71M4');
    expect(result.typeDesignation).toBe('DRS71M4');
    expect(result.supplementary).toBe('');
  });

  it('does not duplicate supersedes note', () => {
    const row = makeRow({ itemNumber: 'X-200 ERS.X-100', supplementary: '(supersedes: OLD-PART)' });
    const result = handleErsPrefix(row);
    expect(result.itemNumber).toBe('X-200');
    expect(result.supplementary).toBe('(supersedes: OLD-PART)');
  });
});
