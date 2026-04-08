'use client';

import { useCallback, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { VerificationResult, NormalizedRow } from '@spare-parts/types';
import { useEditState } from '@/hooks/useEditState';

type RowData = VerificationResult | NormalizedRow;

interface DataTableProps {
  rows: RowData[];
  isVerified: boolean;
  onUpdateRow: (rowIndex: number, col: string, value: string) => void;
  pendingRowIndexes?: Set<number>;
}

function PendingPulse() {
  return (
    <span
      style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: '#22d3ee', animation: 'sp-pulse 1s ease-in-out infinite',
      }}
      aria-label="verifying"
    />
  );
}

const COLUMNS_NORMALIZED = [
  { key: 'internalItemNumber', label: 'Internal Item #', width: 140, editable: false },
  { key: 'description', label: 'Description', width: 220, editable: true },
  { key: 'manufacturer', label: 'Manufacturer', width: 150, editable: true },
  { key: 'itemNumber', label: 'Item Number', width: 170, editable: true },
  { key: 'typeDesignation', label: 'Type Designation', width: 180, editable: true },
  { key: 'supplementary', label: 'Supplementary', width: 200, editable: true },
  { key: 'sparePartCategory', label: 'Category', width: 140, editable: true },
];

const COLUMNS_VERIFIED = [
  ...COLUMNS_NORMALIZED,
  { key: 'verifiedSource', label: 'Verified Source', width: 160, editable: false },
  { key: 'verificationScore', label: 'Score', width: 80, editable: false },
  { key: 'websiteId', label: 'Website ID', width: 220, editable: false },
  { key: 'sourceType', label: 'Source Type', width: 110, editable: false },
];

const ROW_HEIGHT = 36;
const TABLE_HEIGHT = 600;
const STICKY_COL_WIDTH = 140;

function ScoreBadge({ score }: { score: number }) {
  if (!score || score === 0) return <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>—</span>;
  let bg = '#dc2626';
  if (score >= 90) bg = '#16a34a';
  else if (score >= 70) bg = '#ca8a04';
  else if (score >= 50) bg = '#ea580c';
  return (
    <span
      style={{
        background: bg, color: '#fff', borderRadius: 9999,
        padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {score}
    </span>
  );
}

function WebsiteLink({ url }: { url: string }) {
  if (!url) return <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 12 }}>—</span>;
  let domain = url;
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#22d3ee', textDecoration: 'underline', fontSize: 11 }}
      onClick={(e) => e.stopPropagation()}
    >
      {domain}
    </a>
  );
}

export default function DataTable({ rows, isVerified, onUpdateRow, pendingRowIndexes }: DataTableProps) {
  const columns = isVerified ? COLUMNS_VERIFIED : COLUMNS_NORMALIZED;
  const { startEdit, commitEdit, cancelEdit, isEditing, getEditedValue } = useEditState();
  const [, forceRender] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 1 });
  const listRef = useRef<List>(null);

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  const handleCellClick = useCallback(
    (rowIndex: number, col: string, editable: boolean, currentValue: string) => {
      if (!editable) return;
      startEdit(rowIndex, col, currentValue);
      forceRender((n) => n + 1);
    },
    [startEdit],
  );

  const getEditableCols = useCallback(() => {
    return columns.filter((c) => c.editable).map((c) => c.key);
  }, [columns]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, col: string) => {
      if (e.key === 'Enter') {
        const value = (e.target as HTMLInputElement).value;
        commitEdit(rowIndex, col, value);
        onUpdateRow(rowIndex, col, value);
        forceRender((n) => n + 1);
      } else if (e.key === 'Escape') {
        cancelEdit(rowIndex, col);
        forceRender((n) => n + 1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const value = (e.target as HTMLInputElement).value;
        commitEdit(rowIndex, col, value);
        onUpdateRow(rowIndex, col, value);
        const editableCols = getEditableCols();
        const curIdx = editableCols.indexOf(col);
        const nextIdx = e.shiftKey ? curIdx - 1 : curIdx + 1;
        if (nextIdx >= 0 && nextIdx < editableCols.length) {
          const nextCol = editableCols[nextIdx];
          const row = rows.find(
            (r) => ('rowIndex' in r ? r.rowIndex : 0) === rowIndex,
          );
          const nextVal = row
            ? String((row as unknown as Record<string, unknown>)[nextCol] ?? '')
            : '';
          startEdit(rowIndex, nextCol, nextVal);
        }
        forceRender((n) => n + 1);
      }
    },
    [commitEdit, cancelEdit, onUpdateRow, startEdit, getEditableCols, rows],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>, rowIndex: number, col: string) => {
      const value = e.target.value;
      commitEdit(rowIndex, col, value);
      onUpdateRow(rowIndex, col, value);
      forceRender((n) => n + 1);
    },
    [commitEdit, onUpdateRow],
  );

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const row = rows[index];
      if (!row) return null;
      const rowIndex = 'rowIndex' in row ? row.rowIndex : index;
      const isHovered = hoveredRow === index;

      return (
        <div
          style={{
            ...style,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border, #1e2536)',
            background: isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
            width: totalWidth,
          }}
          onMouseEnter={() => setHoveredRow(index)}
          onMouseLeave={() => setHoveredRow(null)}
        >
          {columns.map((col, colIdx) => {
            const rawVal = (row as unknown as Record<string, unknown>)[col.key];
            const value = rawVal == null ? '' : String(rawVal);
            const editedVal = getEditedValue(rowIndex, col.key);
            const displayVal = editedVal !== undefined ? editedVal : value;
            const editing = isEditing(rowIndex, col.key);
            const isSticky = colIdx === 0;

            // Score badge (or pulse while pending)
            if (col.key === 'verificationScore') {
              const isPending = pendingRowIndexes?.has(rowIndex);
              return (
                <div
                  key={col.key}
                  className="flex-shrink-0 h-full flex items-center justify-center"
                  style={{ width: col.width }}
                >
                  {isPending ? <PendingPulse /> : <ScoreBadge score={Number(value)} />}
                </div>
              );
            }

            // Website link
            if (col.key === 'websiteId') {
              return (
                <div
                  key={col.key}
                  className="flex-shrink-0 h-full flex items-center px-2.5"
                  style={{ width: col.width }}
                >
                  <WebsiteLink url={value} />
                </div>
              );
            }

            // Empty cell styling
            const isEmpty = !displayVal;
            const cellStyle: React.CSSProperties = {
              width: col.width,
              ...(isSticky
                ? {
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: isHovered ? '#162032' : '#0f0f1a',
                  }
                : {}),
            };

            return (
              <div
                key={col.key}
                className={`flex-shrink-0 h-full flex items-center ${
                  col.editable ? 'cursor-pointer' : ''
                }`}
                style={cellStyle}
                onClick={() =>
                  handleCellClick(rowIndex, col.key, col.editable, displayVal)
                }
              >
                {editing ? (
                  <input
                    autoFocus
                    defaultValue={displayVal}
                    className="w-full bg-border border border-brand-cyan text-slate-200 px-2 py-1 rounded font-mono text-[11px] outline-none"
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, col.key)}
                    onBlur={(e) => handleBlur(e, rowIndex, col.key)}
                  />
                ) : (
                  <span
                    className="font-mono text-[11px] px-2.5 truncate"
                    style={
                      isEmpty
                        ? { color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', fontSize: 12 }
                        : undefined
                    }
                  >
                    {isEmpty ? '—' : displayVal}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    },
    [rows, columns, isEditing, getEditedValue, handleCellClick, handleKeyDown, handleBlur, hoveredRow, totalWidth],
  );

  if (rows.length === 0) return null;

  return (
    <div className="bg-bg-surface rounded-[10px] overflow-hidden mb-3 border border-border">
      <style jsx>{`
        @keyframes sp-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
      {/* Scrollable container for both header and body */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        {/* Header */}
        <div
          className="flex bg-bg-card border-b-2 border-border"
          style={{ width: totalWidth, position: 'sticky', top: 0, zIndex: 3 }}
        >
          {columns.map((col, colIdx) => (
            <div
              key={col.key}
              className="flex-shrink-0 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-muted whitespace-nowrap"
              style={{
                width: col.width,
                ...(colIdx === 0
                  ? {
                      position: 'sticky',
                      left: 0,
                      zIndex: 4,
                      background: '#1a1a2e',
                    }
                  : {}),
              }}
            >
              {col.label}
              {col.editable && (
                <span style={{ opacity: 0.4, fontSize: 11 }}> ↕</span>
              )}
            </div>
          ))}
        </div>
        {/* Rows */}
        <List
          ref={listRef}
          height={Math.min(TABLE_HEIGHT, rows.length * ROW_HEIGHT)}
          itemCount={rows.length}
          itemSize={ROW_HEIGHT}
          width={totalWidth}
          onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
            setVisibleRange({
              start: visibleStartIndex + 1,
              end: visibleStopIndex + 1,
            });
          }}
        >
          {Row}
        </List>
      </div>
      {/* Footer */}
      <div className="px-4 py-1.5 text-[11px] text-text-muted bg-bg-card border-t border-border flex justify-between">
        <span>
          Showing rows {visibleRange.start}–{visibleRange.end} of {rows.length}
        </span>
        <span>
          Click cell to edit · Enter save · Escape cancel · Tab next cell
        </span>
      </div>
    </div>
  );
}
