'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Job {
  id: string;
  fileName: string;
  status: string;
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
    return 'text-yellow-400';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return '✅';
    if (status === 'processing') return '⏳';
    if (status === 'failed') return '❌';
    return '⏸';
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
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">File Name</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Progress</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Rows</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Created</th>
                <th className="px-4 py-3 text-left font-semibold text-text-secondary">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border/50 hover:bg-bg-primary/30">
                  <td className="px-4 py-3">
                    <span className={getStatusColor(job.status)}>
                      {getStatusIcon(job.status)} {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{job.fileName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-bg-primary rounded h-2">
                        <div
                          className="bg-brand-cyan h-2 rounded"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-text-secondary">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {job.processedRows}/{job.totalRows}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {new Date(job.createdAt).toLocaleDateString()} {new Date(job.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === 'completed' ? (
                      <button
                        onClick={() => router.push(`/results/${job.id}`)}
                        className="text-xs text-brand-cyan hover:underline"
                      >
                        View Results
                      </button>
                    ) : (
                      <span className="text-xs text-text-secondary">-</span>
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
