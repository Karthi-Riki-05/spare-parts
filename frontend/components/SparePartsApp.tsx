'use client';

import { useVerification } from '@/hooks/useVerification';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { logout, getUser } from '@/lib/auth';
import { api } from '@/lib/api';
import FileUpload from './FileUpload';
import SheetSelector from './SheetSelector';
import StatsDashboard from './StatsDashboard';
import ActionBar from './ActionBar';
import ProgressSection from './ProgressSection';
import VerificationLog from './VerificationLog';
import DataTable from './DataTable';
import ManualMappingDialog from './ManualMappingDialog';
import LargeFileWarning from './LargeFileWarning';
import BackgroundJobModal from './BackgroundJobModal';
import ActivityCenter from './ActivityCenter';

interface User {
  email: string;
}

export default function SparePartsApp() {
  const v = useVerification();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activeJobCount, setActiveJobCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('app-theme') as 'light' | 'dark' | null;
    if (stored) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      setUser(currentUser);
      setIsLoading(false);
    };
    checkUser();
  }, []);

  // Poll active job count for badge
  useEffect(() => {
    if (!user) return;
    const poll = async () => {
      try {
        const res = await api.listJobs();
        const active = res.jobs.filter((j: any) => j.status === 'processing' || j.status === 'pending' || j.status === 'awaiting_review');
        setActiveJobCount(active.length);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Handle deep-linking to specific job results via URL param ?jobId=...
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (jobId && v.phase === 'idle') {
      v.loadJobData(jobId);
    }
  }, [searchParams, v.loadJobData, v.phase]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const hasData = v.normalizedRows.length > 0 || v.results.length > 0;

  // While verifying, keep all rows visible and merge in verified results as they arrive.
  // After done, show only verified results.
  const isVerifyingPhase = v.phase === 'verifying';
  let displayRows;
  if (v.phase === 'done' && v.results.length > 0) {
    displayRows = v.results;
  } else if (isVerifyingPhase && v.results.length > 0) {
    const byIndex = new Map(v.results.map((r) => [r.rowIndex, r]));
    displayRows = v.normalizedRows.map((n) => byIndex.get(n.rowIndex) ?? n);
  } else {
    displayRows = v.normalizedRows;
  }
  const verifiedRowIndexes = new Set(v.results.map((r) => r.rowIndex));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-bg-surface mb-4 gap-3 sm:gap-0">
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
          <div className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">
            SP1
          </div>
          <h1 className="text-lg font-bold text-text-primary">Spare Parts Web Verifier</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
            className="text-xs px-2 py-1 bg-border hover:bg-border-hover border border-border rounded text-text-primary transition-colors flex items-center gap-1"
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            <span>{theme === 'light' ? '🌙' : '☀️'}</span>
            <span className="hidden sm:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
          <a href="/jobs" className="text-xs text-brand-cyan hover:underline">
            Jobs
          </a>
          <a href="/docs" className="text-xs text-brand-cyan hover:underline">
            Docs
          </a>
          <button
            onClick={() => setActivityOpen(true)}
            className="relative flex items-center gap-1.5 text-xs px-2 py-1 bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/20 rounded transition-colors"
          >
            <span>📊</span>
            <span className="hidden sm:inline">Activity</span>
            {activeJobCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {activeJobCount}
              </span>
            )}
          </button>
          {user && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-secondary">{user.email}</span>
              <button
                onClick={handleLogout}
                className="px-2 py-1 bg-brand-red/20 hover:bg-brand-red/30 text-brand-red rounded text-xs transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Background job tracking banner */}
      {v.jobTrackingMode && !hasData && v.phase === 'idle' && (
        <div className="bg-bg-surface border border-brand-cyan/30 rounded-lg p-6 mb-4 text-center">
          <p className="text-lg font-bold text-text-primary mb-2">
            ✅ Your {v.rowCount || ''} rows are being processed in the background.
          </p>
          <p className="text-sm text-text-secondary mb-1">📧 Email: {user?.email}</p>
          <p className="text-sm text-text-secondary mb-3">🔔 Browser notification when ready</p>
          <p className="text-xs text-text-muted mb-4">You can safely close this browser.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setActivityOpen(true)}
              className="px-4 py-2 bg-brand-cyan text-white text-sm font-bold rounded hover:bg-brand-cyan/90 transition-colors"
            >
              Open Activity Center
            </button>
            <button
              onClick={v.reset}
              className="px-4 py-2 border border-border text-text-secondary text-sm rounded hover:bg-border transition-colors"
            >
              Upload New File
            </button>
          </div>
          {v.progressMessage && (
            <p className="text-xs text-brand-cyan mt-3">{v.progressMessage}</p>
          )}
        </div>
      )}

      {/* Upload zone — shown when no data loaded */}
      {!hasData && v.phase !== 'detecting' && v.phase !== 'normalizing' && v.phase !== 'verifying' && !v.jobTrackingMode && (
        <FileUpload onFileSelected={v.uploadFile} disabled={v.phase !== 'idle'} />
      )}

      {/* Sheet selector */}
      {v.showSheetSelector && (
        <SheetSelector key="sheet-selector" sheets={v.sheetNames} onSelect={v.selectSheet} />
      )}

      {/* Loading indicator during detect/normalize/initial fetch */}
      {(v.phase === 'detecting' || v.phase === 'normalizing' || (v.phase === 'verifying' && !hasData)) && (
        <ProgressSection
          message={v.progressMessage || 'Processing...'}
          subMessage={v.progressSubMessage}
          progress={v.progress}
          visible
        />
      )}

      {/* Error display */}
      {v.error && (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded-lg p-3 mb-3 text-[13px] text-brand-red">
          {v.error}
        </div>
      )}

      {/* Main workspace — shown when data loaded */}
      {hasData && (
        <>
          {/* Status message for normalized data review */}
          {v.phase === 'idle' && v.normalizedRows.length > 0 && v.results.length === 0 && v.progressMessage && (
            <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg px-4 py-2 mb-3 text-[13px] text-brand-cyan">
              {v.progressMessage}
            </div>
          )}

          <StatsDashboard stats={v.stats} rowCount={v.rowCount} />

          <ActionBar
            phase={v.phase}
            fileName={v.fileName}
            rowCount={v.rowCount}
            formatResult={v.formatResult}
            hasResults={v.results.length > 0}
            onVerify={v.startVerification}
            onStop={v.cancelVerification}
            onReset={v.reset}
            onBack={v.handleBack}
            onExport={v.exportData}
            onManualMapping={() => v.setShowMappingDialog(true)}
            isTracking={v.jobTrackingMode}
          />

          <ProgressSection
            message={v.progressMessage}
            subMessage={v.progressSubMessage}
            progress={v.progress}
            visible={v.phase === 'verifying' || v.phase === 'done'}
          />

          <VerificationLog entries={v.logEntries} />

          <DataTable
            rows={displayRows}
            isVerified={v.results.length > 0 || isVerifyingPhase}
            onUpdateRow={v.updateRow}
            pendingRowIndexes={isVerifyingPhase ? new Set(v.normalizedRows.map((n) => n.rowIndex).filter((i) => !verifiedRowIndexes.has(i))) : undefined}
          />
        </>
      )}

      {/* Modals */}
      <ManualMappingDialog
        open={v.showMappingDialog}
        onClose={() => v.setShowMappingDialog(false)}
        onApply={v.applyManualMapping}
        rawData={v.rawData}
        sheetName={v.sheetNames[v.selectedSheet]?.name || ''}
      />

      <LargeFileWarning
        open={v.showLargeFileWarning}
        rowCount={v.rowCount}
        onContinue={() => v.setShowLargeFileWarning(false)}
        onCancel={v.reset}
      />

      <BackgroundJobModal
        open={v.showBackgroundModal}
        rowCount={v.rowCount}
        userEmail={user?.email || ''}
        onBackground={async () => {
          try {
            await v.submitBackgroundJob();
          } catch (err) {
            // Error is already handled in submitBackgroundJob
          }
        }}
        onWaitHere={v.continueSSEVerification}
      />

      <ActivityCenter
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        userEmail={user?.email || ''}
        onReview={(jobId) => {
          setActivityOpen(false);
          v.loadJobData(jobId);
        }}
        onStartSearch={(jobId) => {
          setActivityOpen(false);
          v.startVerificationAfterReview(jobId);
        }}
      />
    </>
  );
}
