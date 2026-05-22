'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import DataTable from '@/components/DataTable';
import { VerificationResult } from '@spare-parts/types';

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string || (typeof window !== 'undefined' ? window.location.pathname.split('/')[2] : '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [originalHeaders, setOriginalHeaders] = useState<Record<string, string> | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const loadResults = async () => {
      try {
        const data = await api.getJobResults(jobId);
        setResults(data.results || []);
        setStats(data.stats);
        if ((data as any).originalHeaders) setOriginalHeaders((data as any).originalHeaders);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    if (jobId) loadResults();
  }, [jobId]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const blob = await api.exportData(results, [], 'results.xlsx', 'A', undefined, originalHeaders, jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'verification-results.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading results...</div>
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
          <h1 className="text-lg font-bold text-slate-200">Verification Results</h1>
        </div>
        <a href="/" className="text-xs text-brand-cyan hover:underline">Back to App</a>
      </header>

      {error && (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded p-3 mb-3 text-sm text-brand-red">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-bg-surface border border-border rounded p-3">
            <div className="text-xs text-text-secondary">Total</div>
            <div className="text-2xl font-bold">{stats.totalRows}</div>
          </div>
          <div className="bg-green-900/20 border border-green-700/30 rounded p-3">
            <div className="text-xs text-green-400">≥90</div>
            <div className="text-2xl font-bold text-green-400">{stats.scoreAbove90}</div>
          </div>
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded p-3">
            <div className="text-xs text-yellow-400">70-89</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.score70to89}</div>
          </div>
          <div className="bg-orange-900/20 border border-orange-700/30 rounded p-3">
            <div className="text-xs text-orange-400">&lt;70</div>
            <div className="text-2xl font-bold text-orange-400">{stats.scoreBelow70}</div>
          </div>
          <div className="bg-bg-surface border border-border rounded p-3">
            <div className="text-xs text-text-secondary">Verified</div>
            <div className="text-2xl font-bold">{stats.webVerified}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={handleExport} disabled={exporting} className="px-4 py-2 bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white rounded text-sm font-medium">
          {exporting ? 'Exporting...' : '📥 Download'}
        </button>
        <button onClick={() => router.push('/jobs')} className="px-4 py-2 bg-bg-surface hover:bg-bg-surface/80 text-text-primary border border-border rounded text-sm">
          View Jobs
        </button>
      </div>

      <DataTable rows={results} isVerified={true} onUpdateRow={() => {}} originalHeaders={originalHeaders} />
    </div>
  );
}
