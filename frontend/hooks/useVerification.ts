'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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
import { api, JobStatus } from '@/lib/api';
import { fileToBase64 } from '@/lib/utils';
import { BACKGROUND_THRESHOLD } from '@/lib/constants';
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

      // Proactively request notification permission on file upload
      import('@/lib/notifications').then(({ notifications }) => notifications.requestPermission());

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

      // Proactive detection for potentially slow files
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
      // If detection times out or fails (likely > 30s), try background job
      if ((err as Error).message.includes('504') || (err as Error).message.includes('timeout')) {
        try {
          addLog('Detection request timed out, switching to background job...', 'fail');
          const response = await api.submitDetectJob(base64, sheetIndex, fileName);
          setPendingJobId(response.jobId);
          setJobTrackingMode(true);
          setProgressMessage('Background detection in progress...');
          return;
        } catch (innerErr) {
          setPhase('error');
          setError((innerErr as Error).message);
        }
      } else {
        setPhase('error');
        setError((err as Error).message);
      }
    }
  }, [fileName, addLog]);

  const normalizeData = useCallback(
    async (base64: string, sheetIndex: number, format: FormatType, count: number, mapping?: ColumnMapping) => {
      try {
        setPhase('normalizing');
        setProgressMessage('Normalizing data...');
        setProgress(0);

        const backgroundThreshold = BACKGROUND_THRESHOLD;

        if (count > backgroundThreshold) {
          addLog(`Background normalization started (${count} rows)...`, 'success');
          
          // Request notification permission proactively
          import('@/lib/notifications').then(({ notifications }) => notifications.requestPermission());

          const response = await api.submitNormalizeJob(base64, sheetIndex, format, mapping, fileName);
          setPendingJobId(response.jobId);
          setJobTrackingMode(true);
          setProgressMessage('Background normalization in progress...');
          return;
        }

        // Small files keep the current chunked approach for instant feedback
        let accumulator: NormalizedRow[] = [];
        let allOriginalData: RawRow[] = [];
        const BATCH_SIZE = 500;
        let offset = 0;
        let totalOriginalRows = count > 0 ? count : 1; 

        while (offset < totalOriginalRows) {
          const result = await api.normalize(base64, sheetIndex, format, mapping, BATCH_SIZE, offset);
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
    [fileName, addLog],
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
      if (!fileBase64 || !formatResult) return;
      await normalizeData(fileBase64, selectedSheet, formatResult.format, rowCount, mapping);
      setShowMappingDialog(false);
    },
    [fileBase64, selectedSheet, formatResult, rowCount, normalizeData],
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
            else if (st === 'external') s.externalSourceFound++;
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
    // Always show the modal to let user choose Wait Here vs Background
    setShowBackgroundModal(true);
  }, [normalizedRows]);

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
      setPhase('idle');
      setLogEntries([]);
      setProgress(0);
      setProgressMessage('Verification running in background...');

      let jobId: string;

      // If we have a pendingJobId from awaiting_review, use start-search
      if (pendingJobId) {
        await api.startJobSearch(pendingJobId);
        jobId = pendingJobId;
      } else {
        const response = await api.submitJob(normalizedRows, fileName);
        jobId = response.jobId;
        setPendingJobId(jobId);
      }

      setJobTrackingMode(true);
      // Clear normalized rows so UI shows background tracking banner
      setNormalizedRows([]);
      setResults([]);
      addLog(`Background job submitted: ${jobId}`, 'success');
      setProgressMessage('Job running in background. Check Activity Center.');

      return jobId;
    } catch (err) {
      setPhase('error');
      setError((err as Error).message);
      addLog(`Failed to submit background job: ${(err as Error).message}`, 'fail');
      throw err;
    }
  }, [normalizedRows, fileName, addLog, pendingJobId]);

  const startVerificationAfterReview = useCallback(async (jobId: string) => {
    try {
      setPhase('idle'); // Don't block UI
      setProgress(0);
      setProgressMessage('Background search started...');
      await api.startJobSearch(jobId);
      setPendingJobId(jobId);
      setJobTrackingMode(true);
      addLog(`Verification started in background for job: ${jobId}`, 'success');
    } catch (err) {
      setPhase('error');
      setError((err as Error).message);
    }
  }, [addLog]);

  // Background Job Polling Effect
  useEffect(() => {
    if (!jobTrackingMode || !pendingJobId || phase === 'idle' || phase === 'error') return;

    let pollInterval: NodeJS.Timeout;
    let isMounted = true;
    let lastStatus: string | null = null;

    const poll = async () => {
      try {
        const response = await api.getJobStatus(pendingJobId);
        if (!isMounted) return;

        const currentStatus = response.job.status;
        const jobPhase = (response.job as any).currentPhase;
        const jobType = (response.job as any).jobType || 'verify';

        // Notifications for major state transitions
        if (lastStatus === 'processing' && currentStatus === 'awaiting_review') {
          import('@/lib/notifications').then(({ notifications }) => {
            notifications.send('📋 Data Ready for Review', `${response.job.fileName} extracted. Click to review.`);
          });
        }
        if (lastStatus === 'processing' && currentStatus === 'completed') {
          import('@/lib/notifications').then(({ notifications }) => {
            notifications.send('✅ Verification Complete', `${response.job.fileName} verification finished.`);
          });
        }
        lastStatus = currentStatus;

        if (currentStatus === 'awaiting_review') {
          // Normalization done — stop tracking, let ActivityCenter handle review
          setProgress(100);
          setProgressMessage('Data ready for review. Open Activity Center.');
          // Don't stop tracking — keep polling so ActivityCenter can see updates
          return;
        }

        if (currentStatus === 'processing' || currentStatus === 'pending') {
          const total = response.job.totalRows || 0;
          const processed = response.job.processedRows || 0;
          const progress = response.job.progress || 0;
          setProgress(progress);
          
          let prefix = 'Processing';
          if (jobPhase === 'formatting') prefix = 'Step 1/2: Formatting data';
          if (jobPhase === 'verifying') prefix = 'Step 2/2: Verifying items';

          if (total === 0) {
            setProgressMessage(`${prefix}... (Preparing file)`);
          } else {
            setProgressMessage(`${prefix}: ${processed} / ${total}`);
          }

          if (jobPhase === 'verifying' && response.stats) {
            setStats(response.stats as any);
          }
        } else if (currentStatus === 'completed') {
          setProgress(100);
          setProgressMessage('Job complete!');
          
          const resultsResponse = await api.getJobResults(pendingJobId);
          if (!isMounted) return;

          if (jobType === 'verify') {
            setResults(resultsResponse.results);
            setStats(resultsResponse.stats);
            setPhase('done');
          } else {
            // Normalization or Detection
            const data = resultsResponse.results as any;
            if (data.rows) setNormalizedRows(data.rows);
            setPhase('idle');
          }

          setJobTrackingMode(false);
          setPendingJobId(null);
        } else if (currentStatus === 'failed') {
          setPhase('error');
          setError(response.job.errorMessage || 'Background job failed');
          setJobTrackingMode(false);
          setPendingJobId(null);
          addLog(`Background job failed: ${response.job.errorMessage}`, 'fail');
        }
      } catch (err) {
        console.error('Polling error:', err);
        // If the job is missing (e.g. database wipe), stop tracking
        if ((err as any).status === 404 || (err as Error).message?.includes('404')) {
          setJobTrackingMode(false);
          setPendingJobId(null);
          setPhase('idle');
        }
      }
    };

    poll();
    pollInterval = setInterval(poll, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [jobTrackingMode, pendingJobId, phase, addLog]);

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
      // If reviewing from an awaiting_review job, just clear view (don't delete job)
      if (pendingJobId && normalizedRows.length > 0) {
        setNormalizedRows([]);
        setResults([]);
        setStats(null);
        setProgress(0);
        setProgressMessage('');
        setPendingJobId(null);
        setPhase('idle');
        return;
      }
      if (normalizedRows.length > 0) {
        const confirmed = window.confirm('Going back will clear the current data. Continue?');
        if (!confirmed) return;
      }
      reset();
    }
  }, [phase, normalizedRows.length, reset, pendingJobId]);

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
    startVerificationAfterReview,
    loadJobData: useCallback(async (jobId: string) => {
      try {
        setPhase('verifying');
        setProgressMessage('Loading job data...');

        const statusResponse = await api.getJobStatus(jobId);
        const job = statusResponse.job;
        setFileName(job.fileName);
        setRowCount(job.totalRows);

        const jobStatus = job.status;
        const type = (job as any).jobType || 'verify';

        // awaiting_review: load normalized rows for review (not verified yet)
        if (jobStatus === 'awaiting_review') {
          const resultsResponse = await api.getJobResults(jobId);
          const data = resultsResponse.results as any;
          const rows = data.rows || (Array.isArray(data) ? data : []);
          setNormalizedRows(rows);
          setRowCount(rows.length);
          setPendingJobId(jobId); // keep jobId so "Verify in Background" can use start-search
          setResults([]);
          setStats(null);
          setPhase('idle');
          setProgress(0);
          setProgressMessage(`${rows.length} rows ready — review and click Verify All`);
          return;
        }

        const resultsResponse = await api.getJobResults(jobId);

        if (jobStatus === 'completed') {
          // Check if results have verification fields (verificationScore exists)
          const rows = resultsResponse.results;
          const isVerified = Array.isArray(rows) && rows.length > 0
            && rows[0].verificationScore !== undefined && rows[0].verificationScore !== null;

          if (isVerified) {
            setResults(rows);
            setStats(resultsResponse.stats);
            setPhase('done');
            setProgress(100);
            setProgressMessage(`${rows.length} rows verified`);
          } else {
            // Normalize/detect job results stored as JSON
            const data = rows as any;
            const normalizedData = data.rows || (Array.isArray(data) ? data : []);
            setNormalizedRows(normalizedData);
            setRowCount(normalizedData.length);
            setPhase('idle');
            setProgress(0);
            setProgressMessage(`${normalizedData.length} rows loaded`);
          }
        } else {
          // Other statuses (shouldn't normally reach here)
          const data = resultsResponse.results as any;
          if (data.rows) {
            setNormalizedRows(data.rows);
          } else if (Array.isArray(resultsResponse.results)) {
            setNormalizedRows(resultsResponse.results);
          }
          setPhase('idle');
          setProgressMessage('');
        }
      } catch (err) {
        setPhase('error');
        setError(`Failed to load job: ${(err as Error).message}`);
      }
    }, []),
  };
}
