import type {
  FormatDetectionResult,
  FormatType,
  ColumnMapping,
  NormalizedRow,
  RawRow,
  VerificationResult,
} from '@spare-parts/types';

const BASE = '/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: async () => {
    const res = await fetch(`${BASE}/health`, { cache: 'no-store' });
    return res.json();
  },

  getSheets: (fileData: string) =>
    post<{ sheets: { index: number; name: string }[] }>('/get-sheets', { fileData }),

  detectFormat: (fileData: string, sheetIndex = 0) =>
    post<FormatDetectionResult & { rowCount: number }>('/detect-format', { fileData, sheetIndex }),

  normalize: (fileData: string, sheetIndex: number, format: FormatType, mapping?: ColumnMapping) =>
    post<{ rows: NormalizedRow[]; originalData: RawRow[] }>('/normalize', {
      fileData,
      sheetIndex,
      format,
      mapping,
    }),

  manualMap: (fileData: string, sheetIndex: number, mapping: ColumnMapping) =>
    post<{ rows: NormalizedRow[]; originalData: RawRow[] }>('/manual-map', {
      fileData,
      sheetIndex,
      mapping,
    }),

  exportData: async (
    results: VerificationResult[],
    originalData: RawRow[],
    fileName: string,
  ): Promise<Blob> => {
    const res = await fetch(`${BASE}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results, originalData, fileName }),
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },
};
