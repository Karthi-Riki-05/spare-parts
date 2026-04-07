const {
  isInternalInstruction,
  classifySupplementary,
  createChangeLog,
} = require('../../src/services/supplementaryLogger');

describe('isInternalInstruction', () => {
  it('should detect "contact" as internal', () => {
    expect(isInternalInstruction('Contact John for pricing')).toBe(true);
  });

  it('should detect "check with" as internal', () => {
    expect(isInternalInstruction('Check with supplier before ordering')).toBe(true);
  });

  it('should detect "do not" as internal', () => {
    expect(isInternalInstruction('Do not modify this field')).toBe(true);
  });

  it('should detect "internal" as internal', () => {
    expect(isInternalInstruction('Internal use only')).toBe(true);
  });

  it('should detect "see note" as internal', () => {
    expect(isInternalInstruction('See note on purchase order')).toBe(true);
  });

  it('should detect "supplier specific" as internal', () => {
    expect(isInternalInstruction('Supplier specific requirements apply')).toBe(true);
  });

  it('should NOT classify part specs as internal', () => {
    expect(isInternalInstruction('50mm bore, sealed, C3 clearance')).toBe(false);
  });

  it('should NOT classify part numbers as internal', () => {
    expect(isInternalInstruction('Alternative: 6205-2RS1/C3')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isInternalInstruction('')).toBe(false);
  });
});

describe('classifySupplementary', () => {
  it('should classify internal instruction text as TYPE B', () => {
    expect(classifySupplementary('Contact John before ordering')).toBe('internal_instruction');
  });

  it('should classify part spec text as TYPE A', () => {
    expect(classifySupplementary('Bore 50mm, sealed both sides')).toBe('part_specification');
  });

  it('should return unknown for empty text', () => {
    expect(classifySupplementary('')).toBe('unknown');
  });
});

describe('createChangeLog', () => {
  it('should create a complete change log entry', () => {
    const log = createChangeLog(5, 'Original text', 'New text', 45, 'gemini-2.5-flash');

    expect(log.rowIndex).toBe(5);
    expect(log.originalValue).toBe('Original text');
    expect(log.newValue).toBe('New text');
    expect(log.reason).toBe('Confidence score was 45 (<70)');
    expect(log.confidenceScore).toBe(45);
    expect(log.aiModel).toBe('gemini-2.5-flash');
    expect(log.timestamp).toBeTruthy();
  });
});
