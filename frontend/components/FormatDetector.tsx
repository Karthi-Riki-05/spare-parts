'use client';

import type { FormatDetectionResult } from '@spare-parts/types';
import Badge from './ui/Badge';

interface FormatDetectorProps {
  result: FormatDetectionResult;
  onManualMapping?: () => void;
}

const formatLabels: Record<string, string> = {
  A: 'Correct',
  B: 'Single-column',
  C: 'Incomplete',
};

export default function FormatDetector({ result, onManualMapping }: FormatDetectorProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Badge
        label={`Format ${result.format} (${formatLabels[result.format] || result.format})`}
        variant={result.format.toLowerCase() as 'a' | 'b' | 'c'}
      />
      <span className="text-xs text-text-muted">
        {result.confidence}% confidence &middot; {result.reasoning}
      </span>
      {result.confidence < 80 && onManualMapping && (
        <button
          onClick={onManualMapping}
          className="text-xs text-brand-cyan hover:underline"
        >
          Manual Mapping
        </button>
      )}
    </div>
  );
}
