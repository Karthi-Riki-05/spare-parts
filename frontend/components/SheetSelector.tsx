'use client';

import { useState, useMemo, useEffect } from 'react';
import Button from './ui/Button';

interface SheetSelectorProps {
  sheets: { index: number; name: string }[];
  onSelect: (index: number) => void;
}

const DATA_SHEET_PATTERNS = [
  /^sample data$/i,
  /^data sheet$/i,
  /^spare parts$/i,
  /^sheet\d+$/i,
];
const SKIP_SHEET_PATTERNS = [
  /explanation/i,
  /instructions/i,
  /readme/i,
  /guide/i,
  /legend/i,
  /cover/i,
];

function selectDefaultSheet(sheets: { index: number; name: string }[]): number {
  const dataSheet = sheets.find((s) =>
    DATA_SHEET_PATTERNS.some((p) => p.test(s.name)),
  );
  if (dataSheet) return dataSheet.index;

  const nonMetaSheet = sheets.find(
    (s) => !SKIP_SHEET_PATTERNS.some((p) => p.test(s.name)),
  );
  if (nonMetaSheet) return nonMetaSheet.index;

  return sheets[0]?.index ?? 0;
}

export default function SheetSelector({ sheets, onSelect }: SheetSelectorProps) {
  const defaultIdx = useMemo(() => selectDefaultSheet(sheets), [sheets]);
  const [selected, setSelected] = useState(defaultIdx);

  // Sync local selection if defaultIdx changes (e.g., parent reuses component with new sheets)
  useEffect(() => {
    setSelected(defaultIdx);
  }, [defaultIdx]);

  return (
    <div className="bg-bg-surface rounded-[10px] border border-border p-4 mb-3 animate-fade-up">
      <h4 className="text-sm font-semibold text-slate-200 mb-2">
        Multiple sheets detected
      </h4>
      <p className="text-xs text-text-muted mb-3">
        Select which sheet to process:
      </p>
      <div className="flex items-center gap-3">
        <select
          className="bg-border text-text-primary border border-border-hover rounded px-3 py-2 text-[13px] font-sans"
          value={String(selected)}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {sheets.map((s) => (
            <option key={s.index} value={String(s.index)}>
              {s.name}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => onSelect(selected)}>
          Continue
        </Button>
      </div>
    </div>
  );
}
