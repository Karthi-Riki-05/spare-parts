'use client';

import { useVerification } from '@/hooks/useVerification';
import FileUpload from './FileUpload';
import SheetSelector from './SheetSelector';
import StatsDashboard from './StatsDashboard';
import ActionBar from './ActionBar';
import ProgressSection from './ProgressSection';
import VerificationLog from './VerificationLog';
import DataTable from './DataTable';
import ManualMappingDialog from './ManualMappingDialog';
import LargeFileWarning from './LargeFileWarning';

export default function SparePartsApp() {
  const v = useVerification();
  const hasData = v.normalizedRows.length > 0 || v.results.length > 0;
  const displayRows = v.results.length > 0 ? v.results : v.normalizedRows;

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
        <div className="flex items-center gap-2">
          <a href="/docs" className="text-xs text-brand-cyan hover:underline">
            Docs
          </a>
        </div>
      </header>

      {/* Upload zone — shown when no data loaded */}
      {!hasData && v.phase !== 'detecting' && v.phase !== 'normalizing' && (
        <FileUpload onFileSelected={v.uploadFile} disabled={v.phase !== 'idle'} />
      )}

      {/* Sheet selector */}
      {v.showSheetSelector && (
        <SheetSelector sheets={v.sheetNames} onSelect={v.selectSheet} />
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
            isVerified={v.results.length > 0}
            onUpdateRow={v.updateRow}
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
    </>
  );
}
