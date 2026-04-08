'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { JobStatus, JobStats } from '@spare-parts/types';

export default function JobTrackingPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = (params?.jobId || typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '') as string;

  const [job, setJob] = useState<JobStatus | null>(null);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const pollStatus = async () => {
      try {
        const response = await api.getJobStatus(jobId);
        setJob(response.job);
        setStats(response.stats);
        setError(null);

        // Stop polling if complete
        if (response.job.status === 'completed' || response.job.status === 'failed') {
          return;
        }
      } catch (err) {
        setError((err as Error).message);
      }
    };

    // Initial poll
    pollStatus();
    setLoading(false);

    // Poll every 5 seconds while processing
    const interval = setInterval(() => {
      pollStatus().catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-lg font-bold text-brand-red mb-2">Job not found</h2>
          <button
            onClick={() => router.push('/jobs')}
            className="text-sm text-brand-cyan hover:underline"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const progress = Math.round((job.processedRows / job.totalRows) * 100);
  const isProcessing = job.status === 'queued' || job.status === 'processing';
  const isComplete = job.status === 'completed';
  const isFailed = job.status === 'failed';

  // Calculate ETA
  const eta = job.processedRows > 0
    ? Math.ceil(((job.totalRows - job.processedRows) / (job.processedRows / 1)) / 60)
    : null;

  return (
    <div className="min-h-screen bg-bg-default p-5">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/jobs')}
            className="text-sm text-brand-cyan hover:underline mb-4"
          >
            ← Back to Jobs
          </button>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Job Progress</h1>
          <p className="text-sm text-text-secondary">Job ID: {jobId}</p>
        </div>

        {/* Status Card */}
        <div className="bg-bg-surface border border-border rounded-lg p-5 mb-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{job.fileName}</h2>
              <p className="text-xs text-text-muted mt-1">
                Created: {new Date(job.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <div className={`px-3 py-1 rounded text-xs font-semibold ${
                isProcessing ? 'bg-brand-cyan/20 text-brand-cyan' :
                isComplete ? 'bg-green-500/20 text-green-500' :
                isFailed ? 'bg-brand-red/20 text-brand-red' :
                'bg-border text-text-secondary'
              }`}>
                {job.status === 'queued' ? '⏳ Queued' :
                 job.status === 'processing' ? '⏳ Processing' :
                 job.status === 'completed' ? '✅ Complete' :
                 job.status === 'failed' ? '❌ Failed' :
                 job.status}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-text-secondary">Progress</span>
              <span className="text-sm font-semibold text-text-primary">{progress}%</span>
            </div>
            <div className="w-full bg-border rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-cyan h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-text-muted">
                {job.processedRows.toLocaleString()} / {job.totalRows.toLocaleString()} rows
              </span>
              {eta && isProcessing && (
                <span className="text-xs text-text-muted">
                  ETA: ~{eta} minute{eta !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-3 text-xs text-brand-red">
              {error}
            </div>
          )}

          {job.errorMessage && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-3 text-xs text-brand-red">
              {job.errorMessage}
            </div>
          )}
        </div>

        {/* Stats Card */}
        {stats && (
          <div className="bg-bg-surface border border-border rounded-lg p-5 mb-5">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">Web Verified</p>
                <p className="text-lg font-bold text-text-primary">{stats.webVerified}</p>
              </div>
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">Score ≥90</p>
                <p className="text-lg font-bold text-text-primary">{stats.scoreAbove90}</p>
              </div>
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">Score 50-89</p>
                <p className="text-lg font-bold text-text-primary">{stats.score50to89}</p>
              </div>
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">Score &lt;50</p>
                <p className="text-lg font-bold text-text-primary">{stats.scoreBelow50}</p>
              </div>
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">Official Source</p>
                <p className="text-lg font-bold text-text-primary">{stats.officialSourceFound}</p>
              </div>
              <div className="bg-bg-elevated rounded p-3">
                <p className="text-xs text-text-muted">External Source</p>
                <p className="text-lg font-bold text-text-primary">{stats.externalSourceFound}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/jobs')}
            className="flex-1 px-4 py-2 rounded bg-border hover:bg-border/80 text-text-primary text-sm font-medium transition-colors"
          >
            Back to Jobs
          </button>
          {isComplete && (
            <button
              onClick={() => router.push(`/results/${jobId}`)}
              className="flex-1 px-4 py-2 rounded bg-brand-cyan hover:bg-brand-cyan/90 text-white text-sm font-medium transition-colors"
            >
              View Results
            </button>
          )}
        </div>

        {/* Info Message */}
        {isProcessing && (
          <div className="mt-5 bg-brand-cyan/10 border border-brand-cyan/30 rounded-lg p-4 text-sm text-brand-cyan">
            <p>✓ You can safely close this window. We'll send an email when the job completes.</p>
          </div>
        )}
      </div>
    </div>
  );
}
