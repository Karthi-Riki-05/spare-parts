'use client';

import { useState, useCallback } from 'react';

interface AlertState {
  open: boolean;
  title: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const defaultState: AlertState = {
  open: false,
  title: '',
  message: '',
  type: 'info',
  confirmText: 'OK',
  onConfirm: () => {},
};

export function useAlert() {
  const [alertState, setAlertState] = useState<AlertState>(defaultState);

  const showAlert = useCallback((message: string, options?: {
    title?: string;
    type?: 'error' | 'warning' | 'success' | 'info';
    confirmText?: string;
  }) => {
    return new Promise<void>((resolve) => {
      setAlertState({
        open: true,
        message,
        title: options?.title || '',
        type: options?.type || 'info',
        confirmText: options?.confirmText || 'OK',
        onConfirm: () => {
          setAlertState(defaultState);
          resolve();
        },
      });
    });
  }, []);

  const showConfirm = useCallback((message: string, options?: {
    title?: string;
    type?: 'error' | 'warning' | 'success' | 'info';
    confirmText?: string;
    cancelText?: string;
  }) => {
    return new Promise<boolean>((resolve) => {
      setAlertState({
        open: true,
        message,
        title: options?.title || '',
        type: options?.type || 'warning',
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        onConfirm: () => {
          setAlertState(defaultState);
          resolve(true);
        },
        onCancel: () => {
          setAlertState(defaultState);
          resolve(false);
        },
      });
    });
  }, []);

  const showError = useCallback((message: string, title?: string) => {
    return showAlert(message, { title: title || 'Error', type: 'error' });
  }, [showAlert]);

  return { alertState, showAlert, showConfirm, showError };
}
