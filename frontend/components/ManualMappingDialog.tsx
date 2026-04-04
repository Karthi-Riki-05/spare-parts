'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ColumnMapping, RawRow } from '@spare-parts/types';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface ManualMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (mapping: ColumnMapping) => void;
  rawData: RawRow[];
  sheetName?: string;
}

const FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'itemNumber', label: 'Item Number' },
  { key: 'typeDesignation', label: 'Type Designation' },
  { key: 'supplementary', label: 'Supplementary' },
  { key: 'sparePartCategory', label: 'Category' },
] as const;

const STORAGE_PREFIX = 'spv_mapping_';
const MAX_STORED_MAPPINGS = 20;

function generateFingerprint(
  sheetName: string,
  columnCount: number,
  firstRowValues: string[],
): string {
  const raw =
    sheetName + '|' + columnCount + '|' + firstRowValues.slice(0, 3).join('|');
  return btoa(encodeURIComponent(raw)).slice(0, 32);
}

function enforceLRU(currentKey: string) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX) && k !== STORAGE_PREFIX + 'order') {
        keys.push(k);
      }
    }
    if (keys.length > MAX_STORED_MAPPINGS) {
      // Remove oldest entries (simple: remove first found that aren't current)
      const toRemove = keys
        .filter((k) => k !== STORAGE_PREFIX + currentKey)
        .slice(0, keys.length - MAX_STORED_MAPPINGS);
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}
}

export default function ManualMappingDialog({
  open,
  onClose,
  onApply,
  rawData,
  sheetName = '',
}: ManualMappingDialogProps) {
  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [restored, setRestored] = useState(false);

  const fingerprint = useMemo(() => {
    if (rawData.length === 0) return '';
    const firstRow = rawData[0] || {};
    const vals = Object.values(firstRow).map((v) => String(v ?? ''));
    return generateFingerprint(sheetName, headers.length, vals);
  }, [rawData, sheetName, headers.length]);

  // Restore saved mapping on open
  useEffect(() => {
    if (!open || !fingerprint) return;
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + fingerprint);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMapping(parsed);
        setRestored(true);
      } else {
        setMapping({});
        setRestored(false);
      }
    } catch {
      setMapping({});
      setRestored(false);
    }
  }, [open, fingerprint]);

  const handleApply = () => {
    const full: ColumnMapping = {
      internalItemNumber: headers[0] || '',
      description: mapping.description || '',
      manufacturer: mapping.manufacturer || '',
      itemNumber: mapping.itemNumber || '',
      typeDesignation: mapping.typeDesignation || '',
      supplementary: mapping.supplementary || '',
      sparePartCategory: mapping.sparePartCategory || '',
    };
    // Save to localStorage
    if (fingerprint) {
      try {
        localStorage.setItem(
          STORAGE_PREFIX + fingerprint,
          JSON.stringify(mapping),
        );
        enforceLRU(fingerprint);
      } catch {}
    }
    onApply(full);
  };

  const handleReset = () => {
    setMapping({});
    setRestored(false);
  };

  const handleClearAll = () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      setMapping({});
      setRestored(false);
    } catch {}
  };

  return (
    <Modal open={open} onClose={onClose} title="Manual Column Mapping" wide>
      {restored && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded bg-cyan-900/20 border border-cyan-800/30">
          <span className="text-[12px] text-cyan-300">
            Mapping restored from a previous upload of a similar file.
          </span>
          <button
            className="text-[11px] text-cyan-400 underline hover:text-cyan-200"
            onClick={handleReset}
          >
            Reset to blank
          </button>
        </div>
      )}
      <p className="text-[13px] text-text-muted mb-2">
        Assign each field to a column from your file. Preview shows first 3 rows.
      </p>
      <div className="flex flex-col gap-3 mt-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[160px_180px_1fr] gap-3 items-center">
            <span className="text-xs text-text-primary font-medium">{label}:</span>
            <select
              className="bg-border text-text-primary border border-border-hover rounded px-2 py-2 text-[13px] font-sans"
              value={mapping[key] || ''}
              onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
            >
              <option value="">-- select --</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-text-muted truncate">
              {rawData
                .slice(0, 3)
                .map((r) => r[mapping[key] || ''] ?? '')
                .join(', ')}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-5 items-center">
        <Button onClick={handleApply}>Apply Mapping</Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="ml-auto">
          <button
            className="text-[10px] text-text-muted hover:text-text-primary underline"
            onClick={handleClearAll}
          >
            Clear saved mappings
          </button>
        </span>
      </div>
    </Modal>
  );
}
