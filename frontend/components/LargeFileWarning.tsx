'use client';

import Modal from './ui/Modal';
import Button from './ui/Button';

interface LargeFileWarningProps {
  open: boolean;
  rowCount: number;
  onContinue: () => void;
  onCancel: () => void;
}

export default function LargeFileWarning({
  open,
  rowCount,
  onContinue,
  onCancel,
}: LargeFileWarningProps) {
  const estimatedMinutes = Math.ceil(rowCount / 60);

  return (
    <Modal open={open} onClose={onCancel} title="Large File Warning">
      <p className="text-[13px] text-text-muted mb-2">
        This file contains <strong className="text-text-primary">{rowCount.toLocaleString()}</strong> rows.
        Processing may take ~{estimatedMinutes} minutes.
      </p>
      {rowCount > 10000 && (
        <p className="text-xs text-brand-orange mb-4">
          Consider splitting this file into smaller batches for better performance.
        </p>
      )}
      <div className="flex gap-2 mt-5">
        <Button onClick={onContinue}>Continue</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
