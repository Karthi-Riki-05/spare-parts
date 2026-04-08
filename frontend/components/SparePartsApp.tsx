'use client';

import { useVerification } from '@/hooks/useVerification';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout, getUser } from '@/lib/auth';
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

interface User {
  email: string;
}

export default function SparePartsApp() {
  const v = useVerification();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getUser();
      setUser(currentUser);
      setIsLoading(false);
    };
    checkUser();
  }, []);

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
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-surface mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">
            SP1
          </div>
          <h1 className="text-lg font-bold text-slate-200">Spare Parts Web Verifier</h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/docs" className="text-xs text-brand-cyan hover:underline">
            Docs
          </a>
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

      {/* Upload zone — shown when no data loaded */}
      {!hasData && v.phase !== 'detecting' && v.phase !== 'normalizing' && (
        <FileUpload onFileSelected={v.uploadFile} disabled={v.phase !== 'idle'} />
      )}

      {/* Sheet selector */}
      {v.showSheetSelector && (
        <SheetSelector key="sheet-selector" sheets={v.sheetNames} onSelect={v.selectSheet} />
      )}

      {/* Loading indicator during detect/normalize */}
      {(v.phase === 'detecting' || v.phase === 'normalizing') && !hasData && (
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
            const jobId = await v.submitBackgroundJob();
            router.push(`/jobs/${jobId}`);
          } catch (err) {
            // Error is already handled in submitBackgroundJob
          }
        }}
        onWaitHere={v.continueSSEVerification}
      />
    </>
  );
}
