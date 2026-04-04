export type FormatType = 'A' | 'B' | 'C';
export type SourceType = 'official' | 'external' | 'inferred' | 'not_found';
export type VerifiedSourceLabel =
  | 'Manufacturer website'
  | `Distributor: ${string}`
  | 'Not found';
export type SupplementaryType =
  | 'internal_instruction'
  | 'part_specification'
  | 'unknown';
export type UrlValidationStatus =
  | 'valid' | 'redirected' | 'broken' | 'timeout' | 'unchecked';
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

export interface FormatDetectionResult {
  format: FormatType;
  confidence: number;
  reasoning: string;
  suggestedMapping: ColumnMapping;
  rowCount: number;
  sheetIndex: number;
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
