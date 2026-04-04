import { describe, test, expect } from 'vitest';
import { getScoreClass, getScoreLabel, formatBytes, formatETA } from '../lib/utils';

describe('getScoreClass', () => {
  test('score 95 → score-hi', () => {
    expect(getScoreClass(95)).toBe('score-hi');
  });

  test('score 90 → score-hi', () => {
    expect(getScoreClass(90)).toBe('score-hi');
  });

  test('score 75 → score-md', () => {
    expect(getScoreClass(75)).toBe('score-md');
  });

  test('score 70 → score-md', () => {
    expect(getScoreClass(70)).toBe('score-md');
  });

  test('score 60 → score-lo', () => {
    expect(getScoreClass(60)).toBe('score-lo');
  });

  test('score 50 → score-lo', () => {
    expect(getScoreClass(50)).toBe('score-lo');
  });

  test('score 30 → score-vl', () => {
    expect(getScoreClass(30)).toBe('score-vl');
  });

  test('score 0 → score-na', () => {
    expect(getScoreClass(0)).toBe('score-na');
  });

  test('null → score-na', () => {
    expect(getScoreClass(null)).toBe('score-na');
  });

  test('undefined → score-na', () => {
    expect(getScoreClass(undefined)).toBe('score-na');
  });
});

describe('getScoreLabel', () => {
  test('high confidence', () => {
    expect(getScoreLabel(95)).toBe('High confidence');
  });

  test('medium confidence', () => {
    expect(getScoreLabel(75)).toBe('Medium confidence');
  });

  test('low confidence', () => {
    expect(getScoreLabel(55)).toBe('Low confidence');
  });

  test('very low confidence', () => {
    expect(getScoreLabel(30)).toBe('Very low confidence');
  });

  test('not scored', () => {
    expect(getScoreLabel(0)).toBe('Not scored');
  });
});

describe('formatBytes', () => {
  test('0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  test('megabytes', () => {
    expect(formatBytes(2097152)).toBe('2 MB');
  });
});

describe('formatETA', () => {
  test('seconds only', () => {
    expect(formatETA(30)).toBe('~30s remaining');
  });

  test('minutes and seconds', () => {
    expect(formatETA(90)).toBe('~1m 30s remaining');
  });
});
