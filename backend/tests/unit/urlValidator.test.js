const { validateUrl } = require('../../src/services/urlValidatorService');

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('validateUrl (R26)', () => {
  it('should return valid for 200 response', async () => {
    mockFetch.mockResolvedValue({ status: 200, headers: new Headers() });

    const result = await validateUrl('https://example.com/product/123');
    expect(result.status).toBe('valid');
    expect(result.finalUrl).toBe('https://example.com/product/123');
  });

  it('should return redirected with location for 301', async () => {
    mockFetch.mockResolvedValue({
      status: 301,
      headers: new Headers({ location: 'https://example.com/new-url' }),
    });

    const result = await validateUrl('https://example.com/old-url');
    expect(result.status).toBe('redirected');
    expect(result.finalUrl).toBe('https://example.com/new-url');
  });

  it('should return broken for 404', async () => {
    mockFetch.mockResolvedValue({ status: 404, headers: new Headers() });

    const result = await validateUrl('https://example.com/missing');
    expect(result.status).toBe('broken');
    expect(result.finalUrl).toBeNull();
  });

  it('should return timeout on network error', async () => {
    mockFetch.mockRejectedValue(new Error('AbortError'));

    const result = await validateUrl('https://unreachable.example.com');
    expect(result.status).toBe('timeout');
    expect(result.finalUrl).toBeNull();
  });

  it('should return broken for empty URL', async () => {
    const result = await validateUrl('');
    expect(result.status).toBe('broken');
    expect(result.finalUrl).toBeNull();
  });

  it('should return broken for whitespace-only URL', async () => {
    const result = await validateUrl('   ');
    expect(result.status).toBe('broken');
    expect(result.finalUrl).toBeNull();
  });
});
