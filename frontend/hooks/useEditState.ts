'use client';

import { useRef, useCallback, useState } from 'react';

export function useEditState() {
  const editRef = useRef<Map<string, string>>(new Map());
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const getKey = useCallback((rowIndex: number, col: string) => `${rowIndex}_${col}`, []);

  const startEdit = useCallback(
    (rowIndex: number, col: string, currentValue: string) => {
      const key = `${rowIndex}_${col}`;
      editRef.current.set(key, currentValue);
      setActiveKey(key);
    },
    [],
  );

  const commitEdit = useCallback(
    (rowIndex: number, col: string, value: string): string => {
      const key = `${rowIndex}_${col}`;
      editRef.current.set(key, value);
      setActiveKey(null);
      return value;
    },
    [],
  );

  const cancelEdit = useCallback(
    (rowIndex: number, col: string) => {
      const key = `${rowIndex}_${col}`;
      editRef.current.delete(key);
      setActiveKey(null);
    },
    [],
  );

  const isEditing = useCallback(
    (rowIndex: number, col: string) => {
      return activeKey === `${rowIndex}_${col}`;
    },
    [activeKey],
  );

  const getEditedValue = useCallback(
    (rowIndex: number, col: string): string | undefined => {
      return editRef.current.get(`${rowIndex}_${col}`);
    },
    [],
  );

  return { getKey, startEdit, commitEdit, cancelEdit, isEditing, getEditedValue };
}
