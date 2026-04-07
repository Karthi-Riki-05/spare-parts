// Replicate cleanFormatBNoise since it's a local function in normalizeController
function cleanFormatBNoise(rawText) {
  let cleaned = rawText.replace(/(\s*,\s*-)+\s*$/g, '').trim();
  cleaned = cleaned.replace(/\s*,\s*-\s*,\s*/g, ', ');
  return cleaned;
}

describe('cleanFormatBNoise', () => {
  it('strips trailing ", -" sequences', () => {
    const input = 'LIST,KLÄM 45 X 4 LÄ1008 HÖ. RITN:833.170, - , - , - , - ';
    expect(cleanFormatBNoise(input)).toBe('LIST,KLÄM 45 X 4 LÄ1008 HÖ. RITN:833.170');
  });

  it('collapses mid-text ", - , - ," sequences', () => {
    const input = 'BULT AXEL, - , - , - , 8647, W-301875-19, -';
    const result = cleanFormatBNoise(input);
    expect(result).toContain('8647');
    expect(result).toContain('W-301875-19');
    // Trailing ", -" stripped
    expect(result).not.toMatch(/,\s*-\s*$/);
  });

  it('preserves legitimate commas', () => {
    const input = 'Motor, 3-phase, 400V, SEW R77-DRS71M4';
    expect(cleanFormatBNoise(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(cleanFormatBNoise('')).toBe('');
  });

  it('handles text with no noise', () => {
    const input = 'Spårkullager SKF 62304-2RS1 Tätat';
    expect(cleanFormatBNoise(input)).toBe(input);
  });
});
