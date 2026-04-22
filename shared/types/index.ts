export type FormatType = 'A' | 'B' | 'C';
export type SourceType = 'official' | 'external' | 'inferred' | 'not_found' | 'unverified' | 'unknown';
export type VerifiedSourceLabel =
  | 'Manufacturer website'
  | `Distributor: ${string}`
  | 'Not found';
export type SupplementaryType =
  | 'internal_instruction'
  | 'part_specification'
  | 'unknown';
export type UrlValidationStatus =
  | 'unchecked'
  | 'confirmed'
  | 'bot_blocked' | 'bot_blocked_trusted' | 'bot_blocked_untrusted'
  | 'unverified'
  | 'broken_404' | 'broken_error'
  | 'citation_confirmed' | 'citation_partial' | 'citation_replaced'
  | 'no_citations' | 'no_citations_fallback' | 'domain_not_cited'
  // legacy values kept for back-compat with older cached rows
  | 'valid' | 'redirected' | 'broken' | 'timeout' | 'failed_404' | 'failed_error_page' | 'timeout_unverified';
export type AppPhase =
  | 'idle' | 'detecting' | 'normalizing' | 'verifying' | 'done' | 'error';

export interface RawRow {
  [key: string]: string | number | null;
}

export interface NormalizedRow {
  internalItemNumber: string;
  description: string;
  manufacturer: string;
  itemNumber: string;
  typeDesignation: string;
  supplementary: string;
  sparePartCategory?: string;
  _originalFormat?: FormatType;
  rowIndex: number;
}

export interface VerificationResult {
  rowIndex: number;
  internalItemNumber: string;
  description: string;
  manufacturer: string;
  itemNumber: string;
  typeDesignation: string;
  supplementary: string;
  verifiedSource: VerifiedSourceLabel;
  verificationScore: number;
  websiteId: string;
  sourceType: SourceType;
  manufacturerWebsite: string;
  manufacturerInferred: boolean;
  supplementaryUsed: boolean;
  supplementaryChanged: boolean;
  supplementaryOriginal: string;
  supplementaryType: SupplementaryType;
  urlValidationStatus: UrlValidationStatus;
}

export interface ColumnMapping {
  internalItemNumber: string;
  description: string;
  manufacturer: string;
  itemNumber: string;
  typeDesignation: string;
  supplementary: string;
  sparePartCategory?: string;
}

export interface ColumnHeaders {
  [key: string]: string | undefined;
}

export interface FormatDetectionResult {
  format: FormatType;
  confidence: number;
  reasoning: string;
  suggestedMapping: ColumnMapping;
  rowCount: number;
  sheetIndex: number;
  originalHeaders?: ColumnHeaders | null;
}

export interface SupplementaryChangeLog {
  rowIndex: number;
  originalValue: string;
  newValue: string;
  reason: string;
  confidenceScore: number;
  aiModel: string;
  timestamp: string;
}

export interface ProcessingStats {
  totalRows: number;
  webVerified: number;
  emptyCells: number;
  scoreAbove90: number;
  score50to89: number;
  scoreBelow50: number;
  officialSourceFound: number;
  externalSourceFound: number;
  notFound: number;
}

export interface VerificationResponse {
  results: VerificationResult[];
  changeLogs: SupplementaryChangeLog[];
  stats: ProcessingStats;
  cacheHits: number;
}

export type SSEEventType =
  | 'progress'
  | 'row_complete'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface SSEProgressEvent {
  type: 'progress';
  batch: number;
  totalBatches: number;
  completed: number;
  total: number;
  elapsedSeconds: number;
}

export interface SSERowCompleteEvent {
  type: 'row_complete';
  result: VerificationResult;
}

export interface SSECompleteEvent {
  type: 'complete';
  response: VerificationResponse;
}

export interface SSEErrorEvent {
  type: 'error';
  rowIndex: number;
  message: string;
}

export type SSEEvent =
  | SSEProgressEvent
  | SSERowCompleteEvent
  | SSECompleteEvent
  | SSEErrorEvent;

export interface JobStats {
  totalRows: number;
  webVerified: number;
  emptyCells: number;
  scoreAbove90: number;
  score50to89: number;
  scoreBelow50: number;
  officialSourceFound: number;
  externalSourceFound: number;
  notFound: number;
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
    stats: JobStats | null;
  };
}

// ──────────────────────────────────────────────────────────
// Multi-tenant auth (added in P4)
// ──────────────────────────────────────────────────────────
export interface Company {
  id: string;
  companyName: string;
  email: string;
  confirmed: boolean;
  isActive: boolean;
  creditsBalance: number;
  jobCount?: number;
  createdAt: string;
  confirmedAt?: string | null;
  deactivatedAt?: string | null;
  deactivationReason?: string | null;
  confirmationExpiresAt?: string | null;
  lastLoginAt?: string | null;
}

export interface SuperAdmin {
  id: string;
  email: string;
  role: 'super_admin';
}

export interface AuditLog {
  id: string;
  company_id?: string | null;
  super_admin_id?: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface AuthPayload {
  role: 'company' | 'super_admin';
  company_id?: string;
  super_admin_id?: string;
  email: string;
  company_name?: string;
}

export interface CompanyUser {
  id: string;
  email: string;
  companyName: string;
  creditsBalance?: number;
}

export interface DashboardStats {
  companies: { total_companies: number; confirmed_companies: number; active_companies: number };
  jobs: { jobs_today: number; jobs_this_month: number; jobs_total: number };
  cache: {
    totalCached: number;
    officialCount: number;
    distributorCount: number;
    lowCount: number;
    totalHits: number;
    oldestEntry?: string | null;
    newestEntry?: string | null;
    estimatedCostSaved: string;
  };
}
