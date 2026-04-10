'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { notifications } from '@/lib/notifications';

interface ActivityCenterProps {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  onReview: (jobId: string) => void;
  onStartSearch?: (jobId: string) => void;
}

interface JobItem {
  id: string;
  fileName: string;
  status: string;
  jobType?: string;
  currentPhase?: string;
  progress: number;
  processedRows: number;
  totalRows: number;
  createdAt: string;
}

interface PreviewRow {
  internalItemNumber?: string;
  description?: string;
  manufacturer?: string;
  itemNumber?: string;
  typeDesignation?: string;
}

export default function ActivityCenter({ open, onClose, userEmail, onReview, onStartSearch }: ActivityCenterProps) {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'progress' | 'done'>('progress');
  const [previewData, setPreviewData] = useState<Record<string, PreviewRow[]>>({});
  const [loadingSearch, setLoadingSearch] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const seenStatuses = useRef<Record<string, string>>({});

  // Check notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, [open]);

  const requestNotifPermission = useCallback(async () => {
    const granted = await notifications.requestPermission();
    setNotifPermission(granted ? 'granted' : 'denied');
  }, []);

  const fetchJobs = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoading(true);
      const response = await api.listJobs();
      const newJobs = response.jobs as any[];

      // Check for status transitions and fire notifications
      for (const job of newJobs) {
        const prev = seenStatuses.current[job.id];
        if (prev && prev !== job.status) {
          if (prev === 'processing' && job.status === 'awaiting_review') {
            notifications.send(
              'Data Ready for Review',
              `${job.fileName} extracted. Click to review.`,
              { tag: `review-${job.id}` }
            );
          }
          if ((prev === 'processing' || prev === 'awaiting_review') && job.status === 'completed') {
            notifications.send(
              'Verification Complete',
              `${job.fileName} verification finished.`,
              { tag: `complete-${job.id}` }
            );
          }
        }
        seenStatuses.current[job.id] = job.status;
      }

      setJobs(newJobs);

      // Fetch preview data for awaiting_review jobs and stats for completed jobs
      for (const job of newJobs) {
        if ((job.status === 'awaiting_review' || job.status === 'completed') && !previewData[job.id]) {
          try {
            const statusRes = await api.getJobStatus(job.id);
            if ((statusRes as any).previewRows) {
              setPreviewData(prev => ({ ...prev, [job.id]: (statusRes as any).previewRows }));
            }
            // Attach stats to the job object for rendering
            if ((statusRes as any).stats) {
              job.stats = (statusRes as any).stats;
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [previewData]);

  useEffect(() => {
    if (!open) return;

    fetchJobs(true);

    const interval = setInterval(() => {
      fetchJobs();
    }, 10000);

    return () => clearInterval(interval);
  }, [open, fetchJobs]);

  const handleDelete = async (jobId: string) => {
    try {
      await api.deleteJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch (err) {
      alert('Failed to delete job');
    }
  };

  const handleDownload = async (jobId: string, fileName: string) => {
    try {
      const results = await api.getJobResults(jobId);
      const blob = await api.exportData(results.results as any, [], fileName, 'A');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verified_${fileName}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download results');
    }
  };

  const handleStartSearch = async (jobId: string) => {
    try {
      setLoadingSearch(jobId);
      await api.startJobSearch(jobId);
      if (onStartSearch) onStartSearch(jobId);
      // Refresh immediately
      await fetchJobs();
    } catch (err) {
      alert('Failed to start search: ' + (err as Error).message);
    } finally {
      setLoadingSearch(null);
    }
  };

  const progressJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending' || j.status === 'awaiting_review');
  const doneJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');

  if (!open) return null;

  const getPhaseIcon = (job: JobItem) => {
    if (job.status === 'awaiting_review') return '📋';
    if (job.status === 'failed') return '❌';
    if (job.status === 'completed') return '✅';
    if ((job as any).currentPhase === 'formatting') return '⚙️';
    if ((job as any).currentPhase === 'verifying') return '🔎';
    if (job.status === 'pending') return '🕐';
    return '🔄';
  };

  const getPhaseLabel = (job: JobItem) => {
    if (job.status === 'awaiting_review') return 'Ready for your review!';
    if (job.status === 'failed') return 'Processing Failed';
    if (job.status === 'completed') {
      return (job as any).jobType === 'normalize' ? 'Formatting Done' : 'Verification Complete!';
    }
    if ((job as any).currentPhase === 'formatting') return 'Extracting part data...';
    if ((job as any).currentPhase === 'verifying') return 'Deep verification running...';
    if (job.status === 'pending') return 'Waiting to start';
    return 'Processing';
  };

  const getPhaseDescription = (job: JobItem) => {
    if (job.status === 'awaiting_review') {
      return `AI has extracted ${job.totalRows} rows. Review the data mapping before starting deep verification.`;
    }
    if (job.status === 'failed') {
      return (job as any).errorMessage || 'Unknown error occurred';
    }
    if (job.status === 'completed') {
      return `All ${job.totalRows} rows verified.`;
    }
    if ((job as any).currentPhase === 'formatting') {
      return `AI is reading and structuring ${job.totalRows || '...'} rows from your Excel file.`;
    }
    if ((job as any).currentPhase === 'verifying') {
      return `AI is searching manufacturer websites for ${job.totalRows} part numbers. ${job.processedRows} verified so far.`;
    }
    if (job.status === 'pending') {
      return 'Your file is queued for processing.';
    }
    return '';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute top-0 right-0 h-full w-full max-w-md bg-bg-surface border-l border-border shadow-2xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-bold text-text-primary">Activity Center</h2>
            <button onClick={onClose} className="p-2 hover:bg-border rounded-full text-text-secondary">
              ✕
            </button>
          </div>

          {/* Notification Permission */}
          <div className="px-4 pt-3">
            {notifPermission === 'granted' ? (
              <div className="text-xs text-brand-green flex items-center gap-1 mb-2">
                🔔 Notifications on
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="text-xs text-text-secondary flex items-center gap-1 mb-2">
                🔕 Enable in browser settings
              </div>
            ) : (
              <button
                onClick={requestNotifPermission}
                className="text-xs text-brand-cyan hover:underline flex items-center gap-1 mb-2"
              >
                🔔 Enable browser notifications
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex p-1 bg-bg-muted rounded-lg mx-4 mb-3">
            <button
              onClick={() => setActiveTab('progress')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'progress' ? 'bg-bg-surface text-brand-cyan shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              In Progress ({progressJobs.length})
            </button>
            <button
              onClick={() => setActiveTab('done')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'done' ? 'bg-bg-surface text-brand-cyan shadow-sm' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Completed ({doneJobs.length})
            </button>
          </div>

          {/* Job List */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isLoading && jobs.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-text-secondary text-sm">
                Loading activity...
              </div>
            ) : (
              <div className="space-y-3">
                {(activeTab === 'progress' ? progressJobs : doneJobs).map(job => (
                  <div
                    key={job.id}
                    className={`p-3 border rounded-lg ${
                      job.status === 'awaiting_review'
                        ? 'border-brand-yellow/40 bg-brand-yellow/5'
                        : 'border-border bg-bg-muted/50'
                    }`}
                  >
                    {/* Job Header */}
                    <div className="flex justify-between items-start mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {getPhaseIcon(job)} {job.fileName}
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          {new Date(job.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        job.status === 'awaiting_review' ? 'bg-brand-yellow/20 text-brand-yellow' :
                        job.status === 'completed' ? 'bg-brand-green/10 text-brand-green' :
                        job.status === 'failed' ? 'bg-brand-red/10 text-brand-red' :
                        'bg-brand-cyan/10 text-brand-cyan'
                      }`}>
                        {getPhaseLabel(job)}
                      </span>
                    </div>

                    {/* Phase description */}
                    {job.status !== 'completed' && job.status !== 'awaiting_review' && (
                      <p className="text-[11px] text-text-secondary mb-2">{getPhaseDescription(job)}</p>
                    )}

                    {/* Progress Bar */}
                    {(job.status === 'processing' || job.status === 'pending') && (
                      <div className="space-y-1.5 mb-2">
                        <div className="flex justify-between text-[11px] text-text-secondary">
                          <span>
                            {(job as any).currentPhase === 'formatting' ? 'Step 1/2: Extracting data' :
                             (job as any).currentPhase === 'verifying' ? 'Step 2/2: Deep verification' :
                             'Processing'}
                          </span>
                          <span>
                            {job.totalRows === 0 ? 'Preparing...' : `${job.processedRows} / ${job.totalRows} (${job.progress}%)`}
                          </span>
                        </div>
                        <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full transition-all duration-500 bg-brand-cyan"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        {job.totalRows > 0 && job.processedRows > 0 && (
                          <p className="text-[10px] text-text-secondary">
                            {job.processedRows} / {job.totalRows} rows
                          </p>
                        )}
                      </div>
                    )}

                    {/* Awaiting Review — Preview Table + Actions */}
                    {job.status === 'awaiting_review' && (
                      <div className="mt-2">
                        <p className="text-xs text-text-secondary mb-1">
                          {getPhaseDescription(job)}
                        </p>
                        <p className="text-[11px] text-brand-cyan mb-2">
                          Review the full data before verification.
                        </p>

                        {/* Mini preview table */}
                        {previewData[job.id] && previewData[job.id].length > 0 && (
                          <div className="border border-border rounded overflow-hidden mb-3 max-h-48 overflow-y-auto">
                            <table className="w-full text-[10px]">
                              <thead>
                                <tr className="bg-bg-muted">
                                  <th className="px-1.5 py-1 text-left text-text-secondary font-medium">#</th>
                                  <th className="px-1.5 py-1 text-left text-text-secondary font-medium">Description</th>
                                  <th className="px-1.5 py-1 text-left text-text-secondary font-medium">Manufacturer</th>
                                  <th className="px-1.5 py-1 text-left text-text-secondary font-medium">Item #</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewData[job.id].slice(0, 10).map((row, i) => (
                                  <tr key={i} className="border-t border-border">
                                    <td className="px-1.5 py-0.5 text-text-secondary">{i + 1}</td>
                                    <td className="px-1.5 py-0.5 text-text-primary truncate max-w-[120px]">{row.description || '-'}</td>
                                    <td className="px-1.5 py-0.5 text-text-primary truncate max-w-[80px]">{row.manufacturer || '-'}</td>
                                    <td className="px-1.5 py-0.5 text-text-primary truncate max-w-[80px]">{row.itemNumber || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDelete(job.id)}
                            className="flex-1 py-1.5 border border-border text-text-secondary text-[11px] font-bold rounded hover:bg-border transition-colors"
                          >
                            Cancel & Re-upload
                          </button>
                          <button
                            onClick={() => onReview(job.id)}
                            className="flex-1 py-1.5 bg-brand-cyan text-white text-[11px] font-bold rounded hover:bg-brand-cyan/90 transition-colors"
                          >
                            Review Full Data →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Completed Job Actions */}
                    {job.status === 'completed' && (
                      <div className="mt-2">
                        <p className="text-[11px] text-text-secondary mb-2">{getPhaseDescription(job)}</p>

                        {/* Stats summary if available */}
                        {(job as any).stats && (
                          <div className="grid grid-cols-3 gap-1 mb-3 text-[10px]">
                            <div className="bg-brand-green/10 rounded p-1.5 text-center">
                              <div className="font-bold text-brand-green">{(job as any).stats.score_above_90 ?? (job as any).stats.scoreAbove90 ?? '—'}</div>
                              <div className="text-text-secondary">Score ≥90</div>
                            </div>
                            <div className="bg-brand-yellow/10 rounded p-1.5 text-center">
                              <div className="font-bold text-brand-yellow">{(job as any).stats.score_50_to_89 ?? (job as any).stats.score50to89 ?? '—'}</div>
                              <div className="text-text-secondary">Score 50-89</div>
                            </div>
                            <div className="bg-brand-red/10 rounded p-1.5 text-center">
                              <div className="font-bold text-brand-red">{(job as any).stats.score_below_50 ?? (job as any).stats.scoreBelow50 ?? '—'}</div>
                              <div className="text-text-secondary">Score &lt;50</div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDownload(job.id, job.fileName)}
                            className="flex-1 py-1.5 bg-brand-cyan text-white text-[11px] font-bold rounded hover:bg-brand-cyan-hover transition-colors"
                          >
                            📥 Download Excel
                          </button>
                          <button
                            onClick={() => onReview(job.id)}
                            className="flex-1 py-1.5 border border-brand-cyan text-brand-cyan text-[11px] font-bold rounded hover:bg-brand-cyan/10 transition-colors"
                          >
                            👁 View Results
                          </button>
                          <button
                            onClick={() => handleDelete(job.id)}
                            className="px-3 py-1.5 border border-brand-red/30 text-brand-red text-[11px] font-bold rounded hover:bg-brand-red/10 transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Failed Job Actions */}
                    {job.status === 'failed' && (
                      <div className="mt-2">
                        <p className="text-[11px] text-brand-red mb-1">
                          Error: {(job as any).errorMessage || 'Unknown error'}
                        </p>
                        {(job as any).currentPhase && (
                          <p className="text-[10px] text-text-secondary mb-1">
                            Failed during: {(job as any).currentPhase} phase
                          </p>
                        )}
                        {job.processedRows > 0 && (
                          <p className="text-[10px] text-text-secondary mb-2">
                            Rows processed before failure: {job.processedRows}
                          </p>
                        )}
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="px-3 py-1.5 border border-brand-red/30 text-brand-red text-[11px] font-bold rounded hover:bg-brand-red/10 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {(activeTab === 'progress' ? progressJobs : doneJobs).length === 0 && (
                  <div className="text-center py-10 text-text-secondary text-xs">
                    No jobs found in this category.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
