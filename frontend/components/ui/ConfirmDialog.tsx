'use client';

import { useEffect, useRef, useState } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** If set, shows a text input and passes its value to onConfirm. */
  inputLabel?: string;
  inputDefault?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  inputLabel,
  inputDefault = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(inputDefault);

  // Reset input when dialog opens
  useEffect(() => {
    if (open) {
      setInputValue(inputDefault);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, inputDefault]);

  // Escape to cancel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="bg-bg-surface border border-border rounded-lg p-6 w-full max-w-[420px] shadow-xl">
        <h3 className="text-base font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-4">{message}</p>

        {inputLabel && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {inputLabel}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(inputValue); }}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-border text-text-secondary hover:bg-bg-primary transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(inputLabel ? inputValue : undefined)}
            className={`px-4 py-2 text-sm rounded font-medium text-white transition-colors ${
              isDanger
                ? 'bg-brand-red hover:bg-red-700'
                : 'bg-brand-cyan hover:bg-brand-cyan/80'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simple toast-style notification that auto-dismisses. */
export function Toast({
  message,
  type = 'success',
  onDone,
}: {
  message: string;
  type?: 'success' | 'error';
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed top-4 right-4 z-[110] animate-in fade-in slide-in-from-top-2">
      <div
        className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
          type === 'error'
            ? 'bg-brand-red/90 text-white'
            : 'bg-green-600/90 text-white'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
