'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PrefResponse {
  success: boolean;
  key: string;
  hiddenColumns: string[];
}

export function useColumnPreferences(prefKey = 'datatable_columns') {
  const [hiddenColumns, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/preferences/columns?key=${encodeURIComponent(prefKey)}`,
          { credentials: 'include', cache: 'no-store' },
        );
        if (!cancelled && res.ok) {
          const data = (await res.json()) as PrefResponse;
          setHidden(Array.isArray(data.hiddenColumns) ? data.hiddenColumns : []);
        }
      } catch {
        if (!cancelled) setHidden([]);
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefKey]);

  const persist = useCallback(
    async (next: string[]) => {
      try {
        await fetch('/api/preferences/columns', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ key: prefKey, hiddenColumns: next }),
        });
      } catch {
        // UI state already updated; server will retry on next toggle.
      }
    },
    [prefKey],
  );

  const setHiddenColumns = useCallback(
    (next: string[]) => {
      setHidden(next);
      if (loadedRef.current) persist(next);
    },
    [persist],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setHidden((cur) => {
        const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        if (loadedRef.current) persist(next);
        return next;
      });
    },
    [persist],
  );

  const isHidden = useCallback(
    (key: string) => hiddenColumns.includes(key),
    [hiddenColumns],
  );

  return { hiddenColumns, loading, toggleColumn, isHidden, setHiddenColumns };
}
