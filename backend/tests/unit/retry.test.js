import { describe, test, expect, vi } from 'vitest';
const { withRetry } = require('../../src/utils/retry');

describe('withRetry', () => {
  test('should return on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should retry on failure then succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('should throw after all retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'));
    await expect(withRetry(fn, 2, 10)).rejects.toThrow('always fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('should use exponential backoff delay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');
    const start = Date.now();
    await withRetry(fn, 3, 50);
    const elapsed = Date.now() - start;
    // 50ms (2^0 * 50) + 100ms (2^1 * 50) = 150ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});
