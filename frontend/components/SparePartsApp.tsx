'use client';

import { useVerification } from '@/hooks/useVerification';
import { useAlert } from '@/hooks/useAlert';
import { notifications } from '@/lib/notifications';
import { useEffect, useState, useCallback, useRef } from 'react';
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
import AlertModal from './ui/AlertModal';

interface User {
  email: string;
}

export default function SparePartsApp() {
  const v = useVerification();
  const { alertState, showConfirm } = useAlert();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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

  // Poll active job count for badge + auto-open Activity on login if jobs are active.
  // Also drives global desktop-notification dispatch on status transitions, so
  // notifications fire whether or not the Activity Center modal is open.
  const seenJobStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!user) return;
    let firstPoll = true;
    notifications.requestPermission();
    const poll = async () => {
      try {
        const res = await api.listJobs();
        const active = res.jobs.filter((j: any) => j.status === 'processing' || j.status === 'pending' || j.status === 'awaiting_review');
        setActiveJobCount(active.length);

        // Status-transition notifications. On the very first poll we just seed
        // the map so we don't fire stale notifications for already-finished jobs.
        for (const job of res.jobs as any[]) {
          const prev = seenJobStatuses.current[job.id];
          if (!firstPoll && prev && prev !== job.status) {
            if (prev === 'processing' && job.status === 'awaiting_review') {
              notifications.send(
                'Data Ready for Review',
                `${job.fileName} extracted. Click to review.`,
                { tag: `review-${job.id}` }
              );
            } else if ((prev === 'processing' || prev === 'awaiting_review') && job.status === 'completed') {
              notifications.send(
                'Verification Complete',
                `${job.fileName} verification finished.`,
                { tag: `complete-${job.id}` }
              );
            } else if (job.status === 'failed') {
              notifications.send(
                'Verification Failed',
                `${job.fileName}: ${job.errorMessage || 'unknown error'}`,
                { tag: `failed-${job.id}` }
              );
            }
          }
          seenJobStatuses.current[job.id] = job.status;
        }

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
      const confirmed = await showConfirm(
        'Processing is in progress. Background jobs will continue, but inline processing will stop. Are you sure you want to logout?',
        { title: 'Logout', type: 'warning', confirmText: 'Logout', cancelText: 'Stay' }
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
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">SP1</div>
            <h1 className="text-lg font-bold text-text-primary hidden sm:block">Spare Parts Web Verifier</h1>
            <h1 className="text-base font-bold text-text-primary sm:hidden">SP Verifier</h1>
          </div>

          {/* Right: 3 icons */}
          <div className="flex items-center gap-3">
            {/* Theme toggle — icon only */}
            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-border transition-colors text-base"
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* Activity — icon only with badge */}
            <button
              onClick={() => setActivityOpen(true)}
              className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-brand-cyan/10 transition-colors text-base"
              title="Activity Center"
            >
              🔔
              {activeJobCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-brand-red text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">{activeJobCount}</span>
              )}
            </button>

            {/* Profile — initial circle with dropdown */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="w-8 h-8 bg-brand-cyan text-white rounded-full flex items-center justify-center font-bold text-sm hover:bg-brand-cyan/80 transition-colors"
                  title={user.email}
                >
                  {user.email.charAt(0).toUpperCase()}
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 bg-bg-surface border border-border rounded-xl shadow-lg min-w-[200px] z-50 py-1">
                      <div className="px-4 py-3 text-sm text-text-secondary font-medium border-b border-border">{user.email}</div>
                      <a href="/profile" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors">
                        👤 Profile
                      </a>
                      <a href="/jobs" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors">
                        📋 Jobs
                      </a>
                      <a href="/docs" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-border/50 transition-colors">
                        📚 Docs
                      </a>
                      <div className="border-t border-border my-1" />
                      <button onClick={() => { setProfileOpen(false); handleLogout(); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-brand-red hover:bg-brand-red/5 transition-colors w-full text-left">
                        🚪 Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Background job tracking banner */}
      {v.jobTrackingMode && !hasData && v.phase === 'idle' && (
        <div className="bg-bg-surface border border-brand-cyan/30 rounded-lg p-6 mb-4 text-center">
          <p className="text-lg font-bold text-text-primary mb-2">
            {v.awaitingReview
              ? `✅ Your ${v.rowCount || ''} rows are ready for review.`
              : `✅ Your ${v.rowCount || ''} rows are being processed in the background.`}
          </p>
          <p className="text-sm text-text-secondary mb-1">📧 Email: {user?.email}</p>
          {!v.awaitingReview && (
            <p className="text-sm text-text-secondary mb-3">🔔 Browser notification when ready</p>
          )}
          <p className="text-xs text-text-muted mb-4">
            {v.awaitingReview
              ? 'Click Review Data to inspect and confirm before verification.'
              : 'You can safely close this browser.'}
          </p>

          {/* Live progress bar — updates every poll cycle while status === 'processing'.
              Auto-disappears when the poll's completed branch flips phase to 'done'. */}
          {v.progress > 0 && !v.awaitingReview && (
            <div className="max-w-md mx-auto mb-4">
              <div className="flex justify-between items-center mb-1 text-[11px] font-mono text-brand-cyan">
                <span>{v.progressMessage || 'Processing…'}</span>
                <span className="font-bold">{v.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-cyan transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, v.progress))}%` }}
                />
              </div>
              {v.progressSubMessage && (
                <p className="text-[10px] text-text-muted mt-1">{v.progressSubMessage}</p>
              )}
            </div>
          )}

          <div className="flex justify-center gap-3">
            {v.awaitingReview && v.pendingJobId ? (
              <button
                onClick={() => v.pendingJobId && v.loadJobData(v.pendingJobId)}
                className="px-4 py-2 bg-brand-cyan text-white text-sm font-bold rounded hover:bg-brand-cyan/90 transition-colors"
              >
                Review Data
              </button>
            ) : (
              <button
                onClick={() => setActivityOpen(true)}
                className="px-4 py-2 bg-brand-cyan text-white text-sm font-bold rounded hover:bg-brand-cyan/90 transition-colors"
              >
                Open Activity Center
              </button>
            )}
            <button
              onClick={v.reset}
              className="px-4 py-2 border border-border text-text-secondary text-sm rounded hover:bg-border transition-colors"
            >
              Upload New File
            </button>
          </div>
          {v.progressMessage && v.progress === 0 && !v.awaitingReview && (
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
        <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 p-4 mb-3">
          <div className="flex items-start gap-3">
            <span className="text-brand-red text-lg shrink-0">&#9888;</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-red">{v.error}</p>
            </div>
            <button
              onClick={() => v.reset()}
              className="text-text-secondary hover:text-text-primary text-sm shrink-0"
            >
              &#10005;
            </button>
          </div>
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
            visible={v.phase === 'verifying' || v.phase === 'done' || (v.jobTrackingMode && v.progress > 0)}
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
        onWaitHere={() => {}} // unused — single button modal
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

      <AlertModal {...alertState} />

      <AlertModal
        open={v.showBackConfirm}
        title="Go Back"
        message="Going back will clear the current data. Continue?"
        type="warning"
        confirmText="Go Back"
        cancelText="Stay"
        onConfirm={v.confirmBack}
        onCancel={v.cancelBack}
      />
    </>
  );
}
