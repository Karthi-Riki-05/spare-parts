'use client';

import { useEffect, useRef } from 'react';

interface AlertModalProps {
  open: boolean;
  title?: string;
  message: string;
  type?: 'error' | 'warning' | 'success' | 'info';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const icons: Record<string, string> = {
  error: '❌',
  warning: '⚠️',
  success: '✅',
  info: 'ℹ️',
};

const borderColors: Record<string, string> = {
  error: 'border-brand-red/30',
  warning: 'border-brand-yellow/30',
  success: 'border-brand-green/30',
  info: 'border-brand-cyan/30',
};

export default function AlertModal({
  open,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onCancel,
}: AlertModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (onCancel || onConfirm)();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => (onCancel || onConfirm)()}>
      <div
        className={`bg-bg-surface border ${borderColors[type]} rounded-xl p-5 max-w-sm w-full mx-4 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-xl mt-0.5">{icons[type]}</span>
          <div>
            {title && <h3 className="text-sm font-bold text-text-primary mb-1">{title}</h3>}
            <p className="text-sm text-text-secondary">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          {cancelText && onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg bg-border hover:bg-border/80 text-text-primary text-sm font-medium transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
              type === 'error' ? 'bg-brand-red hover:bg-brand-red/90' :
              type === 'warning' ? 'bg-brand-yellow hover:bg-brand-yellow/90 text-black' :
              'bg-brand-cyan hover:bg-brand-cyan/90'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
