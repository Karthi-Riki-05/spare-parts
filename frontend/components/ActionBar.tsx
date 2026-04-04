'use client';

import type { AppPhase, FormatDetectionResult } from '@spare-parts/types';
import Button from './ui/Button';
import Badge from './ui/Badge';
import FormatDetector from './FormatDetector';

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
}: ActionBarProps) {
  return (
    <div className="bg-bg-surface rounded-[10px] p-3 flex flex-wrap items-center justify-between gap-2.5 mb-3 border border-border">
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={phase === 'verifying'}
          title={phase === 'verifying' ? 'Cannot go back while verifying' : 'Go back to previous step'}
        >
          &larr; Back
        </Button>
        {phase !== 'verifying' ? (
          <Button onClick={onVerify} disabled={rowCount === 0}>
            Verify All
          </Button>
        ) : (
          <Button variant="red" onClick={onStop}>
            Stop
          </Button>
        )}
        <Button variant="ghost" onClick={onReset}>
          New File
        </Button>
        {hasResults && (
          <Button variant="green" onClick={onExport}>
            Download Excel
          </Button>
        )}
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        {formatResult && (
          <FormatDetector result={formatResult} onManualMapping={onManualMapping} />
        )}
        <span className="text-xs text-text-muted">{fileName}</span>
        <Badge label={`${rowCount} rows`} />
        <span className="text-[10px] text-text-hint">Click any cell to edit</span>
      </div>
    </div>
  );
}
