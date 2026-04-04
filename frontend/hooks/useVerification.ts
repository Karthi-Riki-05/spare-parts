'use client';

import { useState, useRef, useCallback } from 'react';
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
        setProgress(50);

        const result = await api.normalize(base64, sheetIndex, format);
        setNormalizedRows(result.rows);
        originalDataRef.current = result.originalData;
        rawDataRef.current = result.originalData;
        setRowCount(result.rows.length);

        if (count > 5000) {
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

  const startVerification = useCallback(() => {
    if (normalizedRows.length === 0) return;
    setPhase('verifying');
    setResults([]);
    setChangeLogs([]);
    setLogEntries([]);
    setProgress(0);
    setProgressMessage('Starting verification...');

    const controller = connectSSE('/api/verify', { rows: normalizedRows }, {
      onProgress: (e) => {
        const pct = Math.round((e.completed / e.total) * 100);
        setProgress(pct);
        setProgressMessage(`Verifying batch ${e.batch}/${e.totalBatches}`);
        if (e.total > 1000) {
          const eta = e.elapsedSeconds > 0
            ? ((e.elapsedSeconds / e.completed) * (e.total - e.completed))
            : 0;
          const mins = Math.floor(eta / 60);
          const secs = Math.ceil(eta % 60);
          setProgressSubMessage(
            `Row ${e.completed}/${e.total} | ~${mins}m ${secs}s remaining`,
          );
        } else {
          setProgressSubMessage(`Row ${e.completed}/${e.total}`);
        }
      },
      onRowComplete: (e) => {
        setResults(prev => [...prev, e.result]);
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

  const cancelVerification = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
    setProgressMessage('Verification stopped.');
    setProgress(0);
    addLog('Cancelled by user', 'fail');
  }, [addLog]);

  const exportData = useCallback(async () => {
    try {
      const blob = await api.exportData(results, originalDataRef.current, fileName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verified_${fileName.replace(/\.xlsx?$/i, '')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [results, fileName]);

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
  };
}
