'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Job {
  id: string;
  fileName: string;
  status: string;
  jobType?: string;
  currentPhase?: string;
  totalRows: number;
  processedRows: number;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export default function JobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const loadJobs = async () => {
      try {
        const data = await api.listJobs();
        setJobs(data.jobs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, []);

  const getStatusColor = (status: string) => {
    if (status === 'completed') return 'text-green-400';
    if (status === 'processing') return 'text-blue-400';
    if (status === 'failed') return 'text-red-400';
    if (status === 'awaiting_review') return 'text-yellow-400';
    return 'text-yellow-400';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return '✅';
    if (status === 'processing') return '⏳';
    if (status === 'failed') return '❌';
    if (status === 'awaiting_review') return '📋';
    return '⏸';
  };

  const getPhaseLabel = (job: Job) => {
    if (job.status === 'awaiting_review') return 'Review';
    if (job.currentPhase === 'formatting') return 'normalize';
    if (job.currentPhase === 'verifying') return 'verify';
    return job.currentPhase || job.jobType || '-';
  };

  const handleStartSearch = async (jobId: string) => {
    try {
      await api.startJobSearch(jobId);
      // Refresh list
      const data = await api.listJobs();
      setJobs(data.jobs || []);
    } catch (err) {
      alert('Failed to start search: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-4">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-surface mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">
            SP1
          </div>
          <h1 className="text-lg font-bold text-slate-200">Verification Jobs</h1>
        </div>
        <a href="/" className="text-xs text-brand-cyan hover:underline">Back to App</a>
      </header>

      {error && (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded p-3 mb-3 text-sm text-brand-red">
          {error}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p>No jobs yet. Upload a file to get started.</p>
        </div>
      ) : (
        <div className="bg-bg-surface border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-primary/50">
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Created</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">File</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Phase</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Progress</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border/50 hover:bg-bg-primary/30 cursor-pointer" onClick={() => job.status === 'completed' ? router.push(`/?jobId=${job.id}`) : null}>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-text-primary truncate max-w-[200px]">{job.fileName}</td>
                  <td className="px-4 py-3">
                    <span className={getStatusColor(job.status)}>
                      {getStatusIcon(job.status)} {job.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {getPhaseLabel(job)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-bg-primary rounded h-2">
                        <div className="bg-brand-cyan h-2 rounded" style={{ width: `${job.progress}%` }} />
                      </div>
                      <span className="text-xs text-text-secondary">{job.processedRows}/{job.totalRows}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {job.status === 'completed' && (
                      <button onClick={() => router.push(`/?jobId=${job.id}`)} className="text-xs text-brand-cyan hover:underline">
                        View Results
                      </button>
                    )}
                    {job.status === 'awaiting_review' && (
                      <button onClick={() => handleStartSearch(job.id)} className="text-xs text-brand-yellow hover:underline">
                        Start Deep Search
                      </button>
                    )}
                    {(job.status === 'pending' || job.status === 'processing') && (
                      <span className="text-xs text-text-muted">Running...</span>
                    )}
                    {job.status === 'failed' && (
                      <span className="text-xs text-brand-red">Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
