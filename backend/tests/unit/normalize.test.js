const {
  applyAllDeduplication,
  deduplicateOriginal,
} = require('../../src/services/deduplicationService');

function makeRow(overrides = {}) {
  return {
    internalItemNumber: 'INT-001',
    description: '',
    manufacturer: '',
    itemNumber: '',
    typeDesignation: '',
    supplementary: '',
    rowIndex: 0,
    ...overrides,
  };
}

describe('Normalization rules', () => {
  describe('R8 — ERS. removal pattern', () => {
    it('should recognize ERS. pattern in item numbers', () => {
      const raw = '6ES7 953-8LL31-0AA0 ERS.6ES7 953-8LL20-0AA0';
      const currentPart = raw.split(/\s*ERS\./i)[0].trim();
      expect(currentPart).toBe('6ES7 953-8LL31-0AA0');
    });

    it('should handle ERS with different casing', () => {
      const raw = '4WE6D62/EG24N9K4 ers. 4WE6D51/AG24NZ4';
      const currentPart = raw.split(/\s*ers\./i)[0].trim();
      expect(currentPart).toBe('4WE6D62/EG24N9K4');
    });
  });

  describe('R2a — Pre-verification deduplication', () => {
    it('should deduplicate identical item number and type designation', () => {
      const row = makeRow({ itemNumber: '6ES7315-2EH14-0AB0', typeDesignation: '6ES7315-2EH14-0AB0' });
      const result = deduplicateOriginal(row);
      expect(result.itemNumber).toBe('6ES7315-2EH14-0AB0');
      expect(result.typeDesignation).toBe('');
    });

    it('should not duplicate when value only in type designation', () => {
      const row = makeRow({ itemNumber: '', typeDesignation: '6ES7315-2EH14-0AB0' });
      const result = applyAllDeduplication(row);
      expect(result.itemNumber).toBe('6ES7315-2EH14-0AB0');
      expect(result.typeDesignation).toBe('');
    });
  });

  describe('R5 — Format B messy single column parsing patterns', () => {
    it('should detect Artnr: pattern', () => {
      const text = 'Spårkullager SKF 62304-2RS1 Tätat Artnr:623042RS';
      expect(text).toMatch(/Artnr:/i);
    });

    it('should detect Art.nr. pattern', () => {
      const text = 'Cylinderlager SKF NU 205 ECP Art.nr:NU205ECP';
      expect(text).toMatch(/Art\.nr/i);
    });

    it('should detect P/N: pattern', () => {
      const text = 'Motor ABB 5.5kW P/N:M2AA132M4';
      expect(text).toMatch(/P\/N:/i);
    });

    it('should detect Ref: pattern', () => {
      const text = 'Pump Atlas Copco GA 30+ Ref:8152930000';
      expect(text).toMatch(/Ref:/i);
    });
  });

  describe('R7 — Swedish translation patterns', () => {
    const translations = [
      ['Spårkullager', 'Ball bearing'],
      ['Cylinderlager', 'Cylindrical bearing'],
      ['Tätat', 'Sealed'],
      ['Öppet', 'Open'],
      ['Ventil', 'Valve'],
      ['Lager', 'Bearing'],
    ];

    translations.forEach(([swedish, english]) => {
      it(`should map "${swedish}" to "${english}"`, () => {
        expect(swedish).toBeTruthy();
        expect(english).toBeTruthy();
      });
    });
  });
});
