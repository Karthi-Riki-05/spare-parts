import type {
  FormatDetectionResult,
  FormatType,
  ColumnMapping,
  NormalizedRow,
  RawRow,
  VerificationResult,
} from '@spare-parts/types';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new ApiError(err.error || err.message || `HTTP ${res.status}`, res.status, err);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface JobStatus {
  success: boolean;
  job: {
    id: string;
    status: string;
    fileName: string;
    totalRows: number;
    processedRows: number;
    progress: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  };
  stats: {
    totalRows: number;
    webVerified: number;
    scoreAbove90: number;
    score50to89: number;
    scoreBelow50: number;
  } | null;
}

export interface JobResults {
  success: boolean;
  results: VerificationResult[];
  stats: any;
}

export interface JobList {
  success: boolean;
  jobs: Array<{
    id: string;
    fileName: string;
    status: string;
    totalRows: number;
    processedRows: number;
    progress: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  }>;
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

  normalize: (fileData: string, sheetIndex: number, format: FormatType, mapping?: ColumnMapping, limit?: number, offset?: number) =>
    post<{ rows: NormalizedRow[]; originalData: RawRow[]; totalOriginalRows: number }>('/normalize', {
      fileData,
      sheetIndex,
      format,
      mapping,
      limit,
      offset,
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
    originalFormat?: string,
    language?: string,
  ): Promise<Blob> => {
    // Sanitize to plain objects — prevents circular JSON from React refs/DOM elements
    const safeResults = results.map(r => ({
      rowIndex: r.rowIndex ?? 0,
      internalItemNumber: String(r.internalItemNumber || ''),
      description: String(r.description || ''),
      manufacturer: String(r.manufacturer || ''),
      itemNumber: String(r.itemNumber || ''),
      typeDesignation: String(r.typeDesignation || ''),
      supplementary: String(r.supplementary || ''),
      verifiedSource: String((r as any).verifiedSource || ''),
      verificationScore: Number((r as any).verificationScore) || 0,
      websiteId: String((r as any).websiteId || ''),
      sourceType: String((r as any).sourceType || ''),
      manufacturerWebsite: String((r as any).manufacturerWebsite || ''),
      manufacturerInferred: Boolean((r as any).manufacturerInferred),
      supplementaryUsed: Boolean((r as any).supplementaryUsed),
      supplementaryChanged: Boolean((r as any).supplementaryChanged),
      supplementaryOriginal: String((r as any).supplementaryOriginal || ''),
      supplementaryType: String((r as any).supplementaryType || ''),
      urlValidationStatus: String((r as any).urlValidationStatus || ''),
    }));
    const safeOriginal = originalData.map(r => {
      const plain: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== undefined && typeof v !== 'object') plain[k] = v;
        else if (v === null || v === undefined) plain[k] = '';
      }
      return plain;
    });
    const res = await fetch(`${BASE}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ results: safeResults, originalData: safeOriginal, fileName, originalFormat, language }),
    });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  // Job API
  submitJob: (rows: NormalizedRow[], fileName: string) =>
    post<{ success: boolean; jobId: string; message: string }>('/jobs/submit', { rows, fileName }),

  submitDetectJob: (fileData: string, sheetIndex: number, fileName: string) =>
    post<{ success: boolean; jobId: string; message: string }>('/jobs/detect/submit', { fileData, sheetIndex, fileName }),

  submitNormalizeJob: (fileData: string, sheetIndex: number, format: FormatType, mapping: ColumnMapping | undefined, fileName: string) =>
    post<{ success: boolean; jobId: string; message: string }>('/jobs/normalize/submit', { fileData, sheetIndex, format, mapping, fileName }),

  getJobStatus: (jobId: string) => get<JobStatus>(`/jobs/${jobId}/status`),

  getJobResults: (jobId: string) => get<JobResults>(`/jobs/${jobId}/results`),

  listJobs: () => get<JobList>('/jobs'),

  deleteJob: (jobId: string) => del<{ success: boolean }>(`/jobs/${jobId}`),

  startJobSearch: (jobId: string) => post<{ success: boolean; message: string }>(`/jobs/${jobId}/start-search`, {}),
};

