const { get, set, makeCacheKey, getStats, flush } = require('../../src/services/cacheService');

function makeRow(overrides = {}) {
  return {
    internalItemNumber: 'INT-001',
    description: 'Test Part',
    manufacturer: 'Siemens',
    itemNumber: '6ES7315',
    typeDesignation: '',
    supplementary: '',
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
    websiteId: 'https://example.com',
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

describe('cacheService', () => {
  beforeEach(() => {
    flush();
  });

  it('should return null for cache miss', () => {
    const key = makeCacheKey(makeRow());
    expect(get(key)).toBeNull();
  });

  it('should return cached result on hit', () => {
    const row = makeRow();
    const key = makeCacheKey(row);
    const result = makeResult();
    set(key, result);

    const cached = get(key);
    expect(cached).not.toBeNull();
    expect(cached.verificationScore).toBe(95);
    expect(cached.manufacturer).toBe('Siemens');
  });

  it('should generate different keys for different parts', () => {
    const key1 = makeCacheKey(makeRow({ manufacturer: 'Siemens', itemNumber: '6ES7315', description: 'CPU Module' }));
    const key2 = makeCacheKey(makeRow({ manufacturer: 'SKF', itemNumber: '6205', description: 'Ball bearing' }));
    expect(key1).not.toBe(key2);
  });

  it('should generate different keys for same manufacturer different description', () => {
    // This is the critical collision test — Company C has many Siemens rows with empty itemNumber
    const key1 = makeCacheKey(makeRow({ manufacturer: 'Siemens', itemNumber: '', typeDesignation: '1LA7133-6AA61', description: '3 Fas Motor' }));
    const key2 = makeCacheKey(makeRow({ manufacturer: 'Siemens', itemNumber: '', typeDesignation: '6ES7315-2EH14-0AB0', description: 'SIMATIC S7-300 CPU Module' }));
    expect(key1).not.toBe(key2);
  });

  it('should use internalItemNumber as disambiguator when fields are sparse', () => {
    // Only manufacturer known — ambiguous without internalItemNumber
    const key1 = makeCacheKey(makeRow({ manufacturer: 'Siemens', itemNumber: '', typeDesignation: '', description: '' }));
    const key2 = makeCacheKey(makeRow({ manufacturer: 'Siemens', itemNumber: '', typeDesignation: '', description: '', internalItemNumber: 'DIFF-002' }));
    expect(key1).not.toBe(key2);
  });

  it('should track hit/miss stats', () => {
    const row = makeRow();
    const key = makeCacheKey(row);

    get(key); // miss
    set(key, makeResult());
    get(key); // hit

    const stats = getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.keys).toBe(1);
    expect(stats.hitRate).toBe(50);
  });
});
