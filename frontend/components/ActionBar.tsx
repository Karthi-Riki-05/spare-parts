'use client';

import { useState } from 'react';
import type { AppPhase, FormatDetectionResult, ViewLanguage } from '@spare-parts/types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import FormatDetector from './FormatDetector';
import ConfirmDialog from './ui/ConfirmDialog';

interface ActionBarProps {
  phase: AppPhase;
  fileName: string;
  rowCount: number;
  formatResult: FormatDetectionResult | null;
  hasResults: boolean;
  onVerify: () => void;
  onStop: () => void;
  onReset: () => void;
  onBack: () => void;
  onExport: () => void;
  onManualMapping: () => void;
  isTracking?: boolean;
  viewLanguage?: ViewLanguage;
  onToggleLanguage?: (lang: ViewLanguage) => void;
  hasOriginalData?: boolean;
  hasSvData?: boolean;
}

export default function ActionBar({
  phase,
  fileName,
  rowCount,
  formatResult,
  hasResults,
  onVerify,
  onStop,
  onReset,
  onBack,
  onExport,
  onManualMapping,
  isTracking,
  viewLanguage = 'english',
  onToggleLanguage,
  hasOriginalData = false,
  hasSvData = false,
}: ActionBarProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);

  return (
    <>
    <ConfirmDialog
      open={showCancelModal}
      title="Stop verification?"
      message="Verification will stop. Already-processed rows will be saved and shown."
      confirmLabel="Stop"
      cancelLabel="Keep going"
      variant="danger"
      onConfirm={() => { setShowCancelModal(false); onStop(); }}
      onCancel={() => setShowCancelModal(false)}
    />
    <div className="bg-bg-surface rounded-[10px] p-3 mb-3 border border-border">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2.5">
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:items-center w-full sm:w-auto">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={phase === 'verifying'}
          title={phase === 'verifying' ? 'Cannot go back while verifying' : 'Go back to previous step'}
        >
          &larr; Back
        </Button>
        {phase !== 'verifying' ? (
          <Button
            onClick={onVerify}
            disabled={rowCount === 0 || isTracking}
            title={isTracking ? 'Verification in progress in background' : 'Start verification'}
          >
            {isTracking ? 'Verifying...' : 'Verify All'}
          </Button>
        ) : (
          <Button variant="red" onClick={() => setShowCancelModal(true)}>
            Stop
          </Button>
        )}
        <Button variant="ghost" onClick={onReset}>
          New File
        </Button>
        {hasResults && (
          <Button variant="green" onClick={() => onExport()}>
            Download Excel
          </Button>
        )}
        {(hasOriginalData || hasSvData) && onToggleLanguage && (
          <div className="flex items-center rounded border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => onToggleLanguage('english')}
              className={`px-2.5 py-1.5 transition-colors ${viewLanguage === 'english' ? 'bg-brand-cyan text-white' : 'bg-bg-surface text-text-secondary hover:bg-border'}`}
              title="Show AI-translated English text"
            >
              EN
            </button>
            {hasSvData && (
              <button
                onClick={() => onToggleLanguage('swedish')}
                className={`px-2.5 py-1.5 transition-colors ${viewLanguage === 'swedish' ? 'bg-brand-cyan text-white' : 'bg-bg-surface text-text-secondary hover:bg-border'}`}
                title="Show AI-normalized Swedish (extracted fields, Swedish description)"
              >
                SV
              </button>
            )}
            {hasOriginalData && (
              <button
                onClick={() => onToggleLanguage('original')}
                className={`px-2.5 py-1.5 transition-colors ${viewLanguage === 'original' ? 'bg-brand-cyan text-white' : 'bg-bg-surface text-text-secondary hover:bg-border'}`}
                title="Show original text from uploaded file"
              >
                Original
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        {formatResult && (
          <FormatDetector result={formatResult} onManualMapping={onManualMapping} />
        )}
        <span className="text-xs text-text-muted truncate max-w-[150px] sm:max-w-none">{fileName}</span>
        <Badge label={
          phase === 'done' ? `✅ ${rowCount} verified` :
          phase === 'verifying' ? `🔎 ${rowCount} rows` :
          `📋 ${rowCount} rows`
        } />
      </div>
      </div>
    </div>
    </>
  );
}
