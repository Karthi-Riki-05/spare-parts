'use client';

interface BackgroundJobModalProps {
  open: boolean;
  rowCount: number;
  userEmail: string;
  onBackground: () => void;
  onWaitHere: () => void;
}

export default function BackgroundJobModal({
  open,
  rowCount,
  userEmail,
  onBackground,
  onWaitHere,
}: BackgroundJobModalProps) {
  if (!open) return null;

  // Estimate time: ~8.3 rows/min with multi-Gemini = rowCount / 8.3 minutes
  const estimatedMinutes = Math.ceil(rowCount / 8.3);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-lg font-bold text-text-primary mb-2">🚀 Large File Detected</h2>
        <p className="text-sm text-text-secondary mb-4">
          {rowCount.toLocaleString()} rows will be processed in approximately{' '}
          <span className="font-semibold text-brand-cyan">{estimatedMinutes} minutes</span>.
        </p>

        <div className="bg-bg-elevated rounded p-4 mb-4 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>You can safely close the browser and check back later</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>Email notification will be sent to:</span>
          </div>
          <div className="ml-6 text-text-muted font-mono text-xs break-all">{userEmail}</div>
          <div className="flex items-start gap-2 mt-2">
            <span className="text-brand-cyan mt-0.5">✓</span>
            <span>Results link included in the email</span>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onWaitHere}
            className="px-4 py-2 rounded bg-border hover:bg-border/80 text-text-primary text-sm font-medium transition-colors"
          >
            Wait Here
          </button>
          <button
            onClick={onBackground}
            className="px-4 py-2 rounded bg-brand-cyan hover:bg-brand-cyan/90 text-white text-sm font-medium transition-colors"
          >
            Verify in Background
          </button>
        </div>
      </div>
    </div>
  );
}
