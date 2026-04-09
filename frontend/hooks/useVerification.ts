'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AppPhase,
  FormatDetectionResult,
  NormalizedRow,
  RawRow,
  VerificationResult,
  ProcessingStats,
  SupplementaryChangeLog,
  ColumnMapping,
  FormatType,
} from '@spare-parts/types';
import { api } from '@/lib/api';
import { fileToBase64 } from '@/lib/utils';
import { useSSE } from './useSSE';

export interface LogEntry {
  text: string;
  type: 'success' | 'fail' | 'change';
}

export function useVerification() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<{ index: number; name: string }[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [formatResult, setFormatResult] = useState<FormatDetectionResult | null>(null);
  const [normalizedRows, setNormalizedRows] = useState<NormalizedRow[]>([]);
  const originalDataRef = useRef<RawRow[]>([]);
  const rawDataRef = useRef<RawRow[]>([]);
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [changeLogs, setChangeLogs] = useState<SupplementaryChangeLog[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressSubMessage, setProgressSubMessage] = useState('');
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [showLargeFileWarning, setShowLargeFileWarning] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [jobTrackingMode, setJobTrackingMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { connect: connectSSE } = useSSE();

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'success') => {
    setLogEntries(prev => [...prev, { text, type }]);
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    try {
      setPhase('detecting');
      setError(null);
      setFileName(file.name);
      const base64 = await fileToBase64(file);
      setFileBase64(base64);

      const sheetsResult = await api.getSheets(base64);
      const sheets = sheetsResult.sheets;
      setSheetNames(sheets);

      if (sheets.length > 1) {
        setPhase('idle');
        setShowSheetSelector(true);
      } else {
        await processSheet(base64, 0);
      }
    } catch (err) {
      setPhase('error');
      setError((err as Error).message);
    }
  }, []);

  const processSheet = useCallback(async (base64: string, sheetIndex: number) => {
    try {
      setSelectedSheet(sheetIndex);
      setPhase('detecting');
      setProgressMessage('Detecting format...');
      setProgress(20);

      const detection = await api.detectFormat(base64, sheetIndex);
      setFormatResult(detection);
      setRowCount(detection.rowCount);

      if (detection.confidence < 80) {
        const rawResult = await api.normalize(base64, sheetIndex, detection.format);
        rawDataRef.current = rawResult.originalData;
        setShowMappingDialog(true);
        setPhase('idle');
        return;
      }

      await normalizeData(base64, sheetIndex, detection.format, detection.rowCount);
    } catch (err) {
      setPhase('error');
      setError((err as Error).message);
    }
  }, []);

  const normalizeData = useCallback(
    async (base64: string, sheetIndex: number, format: FormatType, count: number) => {
      try {
        setPhase('normalizing');
        setProgressMessage('Normalizing data...');
        setProgress(0);

        let accumulator: NormalizedRow[] = [];
        let allOriginalData: RawRow[] = [];
        const BATCH_SIZE = 500; // Increased from 200 to 500 for speed
        let offset = 0;
        let totalOriginalRows = count > 0 ? count : 1; 

        while (offset < totalOriginalRows) {
          const result = await api.normalize(base64, sheetIndex, format, undefined, BATCH_SIZE, offset);
          accumulator = [...accumulator, ...(result.rows || [])];
          allOriginalData = [...allOriginalData, ...(result.originalData || [])];
          
          if (result.totalOriginalRows) {
            totalOriginalRows = result.totalOriginalRows;
          }

          offset += BATCH_SIZE;
          setProgress(Math.min(100, Math.round((offset / totalOriginalRows) * 100)));
          setProgressMessage(`Normalizing data... ${Math.min(offset, totalOriginalRows)} / ${totalOriginalRows}`);
        }

        setNormalizedRows(accumulator);
        originalDataRef.current = allOriginalData;
        rawDataRef.current = allOriginalData;
        setRowCount(accumulator.length);

        if (totalOriginalRows > 5000) {
          setShowLargeFileWarning(true);
        }

        setPhase('idle');
        setProgress(0);
        setProgressMessage('');
      } catch (err) {
        setPhase('error');
        setError((err as Error).message);
      }
    },
    [],
  );

  const selectSheet = useCallback(
    async (index: number) => {
      setShowSheetSelector(false);
      if (fileBase64) {
        await processSheet(fileBase64, index);
      }
    },
    [fileBase64, processSheet],
  );

  const applyManualMapping = useCallback(
    async (mapping: ColumnMapping) => {
      if (!fileBase64) return;
      try {
        setShowMappingDialog(false);
        setPhase('normalizing');
        setProgressMessage('Applying mapping...');
        setProgress(40);

        const result = await api.manualMap(fileBase64, selectedSheet, mapping);
        setNormalizedRows(result.rows);
        originalDataRef.current = result.originalData;
        setRowCount(result.rows.length);
        setPhase('idle');
        setProgress(0);
        setProgressMessage('');
      } catch (err) {
        setPhase('error');
        setError((err as Error).message);
      }
    },
    [fileBase64, selectedSheet],
  );

  const doSSEVerification = useCallback(() => {
    if (normalizedRows.length === 0) return;
    setPhase('verifying');
    setResults([]);
    setStats({
      totalRows: normalizedRows.length,
      webVerified: 0, emptyCells: 0,
      scoreAbove90: 0, score50to89: 0, scoreBelow50: 0,
      officialSourceFound: 0, externalSourceFound: 0, notFound: 0,
    });
    setChangeLogs([]);
    setLogEntries([]);
    setProgress(0);
    setProgressMessage('Starting verification...');
    const startedAt = Date.now();

    const controller = connectSSE('/api/verify', { rows: normalizedRows }, {
      onProgress: (e) => {
        const pct = Math.round((e.completed / e.total) * 100);
        setProgress(pct);
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const rowsPerMin = Math.round((e.completed / elapsedSec) * 60);
        const remaining = e.total - e.completed;
        const etaSec = e.completed > 0 ? Math.round((elapsedSec / e.completed) * remaining) : 0;
        const mins = Math.floor(etaSec / 60);
        const secs = etaSec % 60;
        setProgressMessage(`Verifying row ${e.completed} of ${e.total} — ${rowsPerMin} rows/min`);
        setProgressSubMessage(remaining > 0 ? `~${mins}m ${secs}s remaining` : 'Finalizing...');
      },
      onRowComplete: (e) => {
        setResults(prev => {
          const next = [...prev, e.result];
          // Recompute stats live from accumulated results
          const s = {
            totalRows: normalizedRows.length,
            webVerified: 0, emptyCells: 0,
            scoreAbove90: 0, score50to89: 0, scoreBelow50: 0,
            officialSourceFound: 0, externalSourceFound: 0, notFound: 0,
          };
          for (const r of next) {
            if (r.verificationScore > 0) s.webVerified++;
            if (r.verificationScore >= 90) s.scoreAbove90++;
            else if (r.verificationScore >= 50) s.score50to89++;
            else s.scoreBelow50++;
            const st = String(r.sourceType);
            if (st === 'official') s.officialSourceFound++;
            else if (st === 'external' || st === 'distributor') s.externalSourceFound++;
            else if (st === 'not_found') s.notFound++;
            s.emptyCells += [r.description, r.manufacturer, r.itemNumber, r.websiteId].filter(f => !f || String(f).trim() === '').length;
          }
          setStats(s);
          return next;
        });

        const score = e.result.verificationScore;
        const label = e.result.manufacturer
          ? `${e.result.manufacturer} ${e.result.itemNumber}`
          : e.result.itemNumber || `Row ${e.result.rowIndex}`;
        addLog(`${label} — score ${score}`, score >= 50 ? 'success' : 'fail');

        if (e.result.supplementaryChanged) {
          addLog(
            `Supplementary modified: "${e.result.supplementaryOriginal}" → "${e.result.supplementary}"`,
            'change',
          );
        }
      },
      onComplete: (e) => {
        setResults(e.response.results);
        setStats(e.response.stats);
        setChangeLogs(e.response.changeLogs);
        setPhase('done');
        setProgress(100);
        setProgressMessage('Verification complete');
        setProgressSubMessage(`${e.response.cacheHits} cache hits`);
        addLog(`Done — ${e.response.results.length} rows verified`, 'success');
      },
      onError: (e) => {
        if (e.rowIndex >= 0) {
          addLog(`Row ${e.rowIndex}: ${e.message}`, 'fail');
        } else {
          setPhase('error');
          setError(e.message);
        }
      },
    });

    abortRef.current = controller;
  }, [normalizedRows, connectSSE, addLog]);

  const startVerification = useCallback(() => {
    if (normalizedRows.length === 0) return;
    // For >100 rows, show background job modal
    if (normalizedRows.length > 100) {
      setShowBackgroundModal(true);
    } else {
      // For smaller files, use SSE real-time verification
      doSSEVerification();
    }
  }, [normalizedRows, doSSEVerification]);

  const cancelVerification = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setProgressMessage('Verification stopped.');
    setProgress(0);
    addLog('Cancelled by user', 'fail');
  }, [addLog]);

  const submitBackgroundJob = useCallback(async () => {
    try {
      setShowBackgroundModal(false);
      setPhase('verifying');
      setLogEntries([]);
      setProgressMessage('Submitting job to background queue...');

      const response = await api.submitJob(normalizedRows, fileName);

      setPendingJobId(response.jobId);
      setJobTrackingMode(true);
      addLog(`Background job submitted: ${response.jobId}`, 'success');
      setProgressMessage('Job queued. You can now close this browser window.');
      setProgressSubMessage('Tracking link sent via email after completion.');

      return response.jobId;
    } catch (err) {
      setPhase('error');
      setError((err as Error).message);
      addLog(`Failed to submit background job: ${(err as Error).message}`, 'fail');
      throw err;
    }
  }, [normalizedRows, fileName, addLog]);

  const continueSSEVerification = useCallback(() => {
    setShowBackgroundModal(false);
    doSSEVerification();
  }, [doSSEVerification]);

  const exportData = useCallback(async () => {
    try {
      const blob = await api.exportData(
        results,
        originalDataRef.current,
        fileName,
        formatResult?.format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verified_${fileName.replace(/\.xlsx?$/i, '')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Download failed: ${(err as Error).message}`);
    }
  }, [results, fileName, formatResult]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setError(null);
    setFileBase64(null);
    setFileName('');
    setSheetNames([]);
    setSelectedSheet(0);
    setFormatResult(null);
    setNormalizedRows([]);
    originalDataRef.current = [];
    rawDataRef.current = [];
    setResults([]);
    setStats(null);
    setChangeLogs([]);
    setProgress(0);
    setProgressMessage('');
    setProgressSubMessage('');
    setLogEntries([]);
    setShowSheetSelector(false);
    setShowLargeFileWarning(false);
    setShowMappingDialog(false);
    setRowCount(0);
  }, []);

  const handleBack = useCallback(() => {
    if (phase === 'done') {
      // Go back to normalized (pre-verification) view — keep normalizedRows, clear results
      setResults([]);
      setStats(null);
      setChangeLogs([]);
      setLogEntries([]);
      setProgress(0);
      setProgressMessage('');
      setProgressSubMessage('');
      setPhase('idle');
      return;
    }

    if (phase === 'idle' || phase === 'detecting' || phase === 'normalizing' || phase === 'error') {
      if (normalizedRows.length > 0) {
        const confirmed = window.confirm('Going back will clear the current data. Continue?');
        if (!confirmed) return;
      }
      reset();
    }
  }, [phase, normalizedRows.length, reset]);

  const updateRow = useCallback(
    (rowIndex: number, col: string, value: string) => {
      if (results.length > 0) {
        setResults(prev =>
          prev.map(r => (r.rowIndex === rowIndex ? { ...r, [col]: value } : r)),
        );
      } else {
        setNormalizedRows(prev =>
          prev.map(r => (r.rowIndex === rowIndex ? { ...r, [col]: value } : r)),
        );
      }
    },
    [results.length],
  );

  return {
    phase,
    error,
    fileName,
    fileBase64,
    sheetNames,
    selectedSheet,
    formatResult,
    normalizedRows,
    results,
    stats,
    changeLogs,
    progress,
    progressMessage,
    progressSubMessage,
    logEntries,
    showSheetSelector,
    showLargeFileWarning,
    showMappingDialog,
    rowCount,
    rawData: rawDataRef.current,
    uploadFile,
    selectSheet,
    processSheet: (idx: number) => fileBase64 && processSheet(fileBase64, idx),
    applyManualMapping,
    startVerification,
    cancelVerification,
    exportData,
    reset,
    handleBack,
    updateRow,
    setShowLargeFileWarning,
    setShowMappingDialog,
    showBackgroundModal,
    setShowBackgroundModal,
    pendingJobId,
    jobTrackingMode,
    submitBackgroundJob,
    continueSSEVerification,
  };
}
