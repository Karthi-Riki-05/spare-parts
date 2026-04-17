'use client';

interface ErrorBannerProps {
  message: string;
  requestId?: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({ message, requestId, onDismiss }: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 p-4">
      <div className="flex items-start gap-3">
        <span className="text-brand-red text-lg shrink-0">&#9888;</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-red">{message}</p>
          {requestId && (
            <p className="text-xs text-text-secondary mt-1">Reference: {requestId}</p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-text-secondary hover:text-text-primary text-sm shrink-0"
          >
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}
