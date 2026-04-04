'use client';

import ProgressBar from './ui/ProgressBar';

interface ProgressSectionProps {
  message: string;
  subMessage: string;
  progress: number;
  visible: boolean;
}

export default function ProgressSection({
  message,
  subMessage,
  progress,
  visible,
}: ProgressSectionProps) {
  if (!visible) return null;

  return (
    <div className="bg-bg-surface rounded-[10px] p-2.5 px-4 mb-3 border border-border animate-fade-up">
      <div className="text-xs text-brand-cyan font-medium">{message}</div>
      {subMessage && (
        <div className="text-[10px] text-text-muted mt-0.5 mb-1.5">{subMessage}</div>
      )}
      <ProgressBar value={progress} />
    </div>
  );
}
