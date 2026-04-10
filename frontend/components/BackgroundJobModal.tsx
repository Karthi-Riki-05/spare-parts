'use client';

interface BackgroundJobModalProps {
  open: boolean;
  rowCount: number;
  userEmail: string;
  onBackground: () => void;
  onWaitHere: () => void;
}

function estimateMinutes(rows: number): number {
  const rowsPerMin = 120;
  return Math.max(1, Math.ceil(rows / rowsPerMin));
}

export { estimateMinutes };

export default function BackgroundJobModal({
  open,
  rowCount,
  userEmail,
  onBackground,
}: BackgroundJobModalProps) {
  if (!open) return null;

  const estimatedMinutes = estimateMinutes(rowCount);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onBackground}>
      <div className="bg-bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-text-primary mb-2">🚀 Start Verification</h2>
        <p className="text-sm text-text-secondary mb-4">
          {rowCount.toLocaleString()} rows will be verified in approximately{' '}
          <span className="font-semibold text-brand-cyan">
            {estimatedMinutes < 60
              ? `${estimatedMinutes} minute${estimatedMinutes > 1 ? 's' : ''}`
              : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`}
          </span>.
        </p>

        <div className="bg-bg-elevated rounded p-4 mb-5 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>Process runs in background</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>You can safely close the browser</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>Email notification to:</span>
          </div>
          <div className="ml-6 text-text-muted font-mono text-xs break-all">{userEmail}</div>
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>Results link included in email</span>
          </div>
        </div>

        <button
          onClick={onBackground}
          className="w-full py-2.5 rounded-lg bg-brand-cyan hover:bg-brand-cyan/90 text-white text-sm font-bold transition-colors"
        >
          Start Verification
        </button>
      </div>
    </div>
  );
}
