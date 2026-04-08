import type {
  FormatDetectionResult,
  FormatType,
  ColumnMapping,
  NormalizedRow,
  RawRow,
  VerificationResult,
} from '@spare-parts/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const BASE = `${BACKEND_URL}/api`;

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
    throw new Error(err.error || `HTTP ${res.status}`);
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

  // Job API
  submitJob: (rows: NormalizedRow[], fileName: string) =>
    post<{ success: boolean; jobId: string; message: string }>('/jobs/submit', { rows, fileName }),

  getJobStatus: (jobId: string) => get<JobStatus>(`/jobs/${jobId}/status`),

  getJobResults: (jobId: string) => get<JobResults>(`/jobs/${jobId}/results`),

  listJobs: () => get<JobList>('/jobs'),
};

