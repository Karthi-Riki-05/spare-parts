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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Poll active job count for badge + auto-open Activity on login if jobs are active
  useEffect(() => {
    if (!user) return;
    let firstPoll = true;
    const poll = async () => {
      try {
        const res = await api.listJobs();
        const active = res.jobs.filter((j: any) => j.status === 'processing' || j.status === 'pending' || j.status === 'awaiting_review');
        setActiveJobCount(active.length);

        // On first load after login: if there are active or recently completed jobs, auto-open Activity Center
        if (firstPoll && active.length > 0 && !hasData && v.phase === 'idle') {
          setActivityOpen(true);
        }
        firstPoll = false;
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

  const isProcessing = v.phase === 'detecting' || v.phase === 'normalizing' || v.phase === 'verifying';

  const handleLogout = async () => {
    if (isProcessing) {
      const confirmed = window.confirm(
        'Processing is in progress. Background jobs will continue, but inline processing will stop.\n\nAre you sure you want to logout?'
      );
      if (!confirmed) return;
    }
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
      <header className="border-b border-border bg-bg-surface mb-4">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">
              SP1
            </div>
            <h1 className="text-lg font-bold text-text-primary hidden sm:block">Spare Parts Web Verifier</h1>
            <h1 className="text-base font-bold text-text-primary sm:hidden">SP Verifier</h1>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="text-xs px-2 py-1 bg-border hover:bg-border-hover border border-border rounded text-text-primary transition-colors">
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
            <a href="/jobs" className="text-xs text-brand-cyan hover:underline">Jobs</a>
            <a href="/docs" className="text-xs text-brand-cyan hover:underline">Docs</a>
            <button onClick={() => setActivityOpen(true)} className="relative flex items-center gap-1.5 text-xs px-2 py-1 bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/20 rounded transition-colors">
              <span>📊</span><span>Activity</span>
              {activeJobCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">{activeJobCount}</span>
              )}
            </button>
            {user && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-secondary">{user.email}</span>
                <button onClick={handleLogout} className="px-2 py-1 bg-brand-red/20 hover:bg-brand-red/30 text-brand-red rounded text-xs transition-colors">Logout</button>
              </div>
            )}
          </div>

          {/* Mobile: Activity + Hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <button onClick={() => setActivityOpen(true)} className="relative p-2 text-brand-cyan">
              <span>📊</span>
              {activeJobCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">{activeJobCount}</span>
              )}
            </button>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-text-primary text-xl" aria-label="Menu">
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border px-4 py-2 space-y-1 bg-bg-surface">
            <a href="/jobs" className="block py-2.5 text-sm text-brand-cyan">Jobs</a>
            <a href="/docs" className="block py-2.5 text-sm text-brand-cyan">Docs</a>
            <button onClick={() => { setTheme(t => t === 'light' ? 'dark' : 'light'); setMobileMenuOpen(false); }} className="block w-full text-left py-2.5 text-sm text-text-primary">
              {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </button>
            {user && (
              <>
                <div className="py-2.5 text-sm text-text-secondary">{user.email}</div>
                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="block w-full text-left py-2.5 text-sm text-brand-red">Logout</button>
              </>
            )}
          </div>
        )}
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

      {/* Validation error — file rejected */}
      {v.validationError && (
        <div className="bg-brand-red/5 border border-brand-red/30 rounded-lg p-5 mb-4">
          <h3 className="text-base font-bold text-brand-red mb-2">Invalid File</h3>
          <p className="text-sm text-text-primary mb-2">This file doesn&apos;t appear to contain spare parts data.</p>
          <p className="text-xs text-text-secondary mb-1"><strong>Detected:</strong> {v.validationError.detectedType}</p>
          <p className="text-xs text-text-secondary mb-3"><strong>Reason:</strong> {v.validationError.reason}</p>
          <p className="text-xs text-text-muted mb-3">Please upload a file containing part descriptions, manufacturer names, and item/part numbers.</p>
          <button onClick={v.reset} className="px-4 py-2 bg-brand-cyan text-white text-sm font-medium rounded hover:bg-brand-cyan/90 transition-colors">
            Try Another File
          </button>
        </div>
      )}

      {/* Upload zone — shown when no data loaded */}
      {!hasData && v.phase !== 'detecting' && v.phase !== 'normalizing' && v.phase !== 'verifying' && !v.jobTrackingMode && !v.validationError && (
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

          {/* Language detection badge */}
          {v.detectedLanguage && v.detectedLanguage.language !== 'English' && v.detectedLanguage.translationNeeded && (
            <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-lg px-4 py-2 mb-3 text-[12px] text-brand-blue flex items-center gap-2">
              <span>🌐</span>
              <span>{v.detectedLanguage.language} detected — translated to English for verification</span>
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
            onExport={() => v.exportData()}
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
