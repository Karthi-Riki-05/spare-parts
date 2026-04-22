'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import type { VerificationResult, NormalizedRow } from '@spare-parts/types';
import { useEditState } from '@/hooks/useEditState';
import { useColumnPreferences } from '@/hooks/useColumnPreferences';

type RowData = VerificationResult | NormalizedRow;

interface DataTableProps {
  rows: RowData[];
  isVerified: boolean;
  onUpdateRow: (rowIndex: number, col: string, value: string) => void;
  pendingRowIndexes?: Set<number>;
  originalHeaders?: Record<string, string> | null;
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

// Map field keys to col_N positions for dynamic header resolution
const FIELD_TO_COL: Record<string, string> = {
  internalItemNumber: 'col_0',
  description: 'col_1',
  manufacturer: 'col_2',
  itemNumber: 'col_3',
  typeDesignation: 'col_4',
  supplementary: 'col_5',
  sparePartCategory: 'col_6',
};

const DEFAULT_LABELS: Record<string, string> = {
  internalItemNumber: 'Internal Item #',
  description: 'Description',
  manufacturer: 'Manufacturer',
  itemNumber: 'Item Number',
  typeDesignation: 'Type Designation',
  supplementary: 'Supplementary',
  sparePartCategory: 'Category',
};

function truncateLabel(str: string, max = 15): string {
  if (str.length <= max) return str;
  return str.substring(0, max) + '\u2026';
}

function getColumnLabel(field: string, headers: Record<string, string> | null | undefined): { short: string; full: string } {
  const colKey = FIELD_TO_COL[field];
  const raw = colKey && headers ? (headers[colKey] ?? '').trim() : '';
  if (raw) {
    return { short: truncateLabel(raw), full: raw };
  }
  const fallback = DEFAULT_LABELS[field] || field;
  return { short: fallback, full: fallback };
}

function buildColumns(isVerified: boolean, headers: Record<string, string> | null | undefined) {
  const norm = [
    { key: 'internalItemNumber', width: 140, editable: false },
    { key: 'description', width: 220, editable: true },
    { key: 'manufacturer', width: 150, editable: true },
    { key: 'itemNumber', width: 170, editable: true },
    { key: 'typeDesignation', width: 180, editable: true },
    { key: 'supplementary', width: 200, editable: true },
    { key: 'sparePartCategory', width: 140, editable: true },
  ].map(col => {
    const { short, full } = getColumnLabel(col.key, headers);
    return { ...col, label: short, fullLabel: full };
  });

  if (!isVerified) return norm;

  return [
    ...norm,
    { key: 'verifiedSource', label: 'Verified Source', fullLabel: 'Verified Source', width: 160, editable: false },
    { key: 'verificationScore', label: 'Score', fullLabel: 'Verification Score', width: 80, editable: false },
    { key: 'websiteId', label: 'Website ID', fullLabel: 'Website ID', width: 220, editable: false },
    { key: 'sourceType', label: 'Source Type', fullLabel: 'Source Type', width: 110, editable: false },
  ];
}

const ROW_HEIGHT = 36;
const TABLE_HEIGHT = 500; // Reduced from 600
const STICKY_COL_WIDTH = 140;

function ScoreBadge({ score }: { score: number }) {
  // Not yet verified (null / undefined / NaN) → em-dash, no badge.
  if (score == null || Number.isNaN(score)) {
    return <span style={{ opacity: 0.5, fontSize: 11 }}>—</span>;
  }
  // Light background + dark text pills per design spec.
  let bg = '#FEE2E2', fg = '#991B1B';       // <50 (and 0) → red
  if (score >= 90)      { bg = '#D1FAE5'; fg = '#065F46'; }  // green
  else if (score >= 70) { bg = '#FEF3C7'; fg = '#92400E'; }  // yellow
  else if (score >= 50) { bg = '#FED7AA'; fg = '#9A3412'; }  // orange
  return (
    <span
      style={{
        background: bg, color: fg, borderRadius: 9999,
        padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      {score}
    </span>
  );
}

function truncateText(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function WebsiteLink({ url, status }: { url: string; status?: string }) {
  if (!url) return <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: 12 }}>—</span>;

  // Pick icon + color + tooltip by url_validation_status.
  let icon: React.ReactNode = null;
  let tip = url;
  let linkClass = 'text-blue-600 hover:underline text-xs truncate block max-w-[180px]';

  switch (status) {
    case 'citation_confirmed':
    case 'confirmed':
    case 'valid':
    case 'redirected':
      // plain blue link, no icon
      break;
    case 'citation_partial':
      icon = <span aria-label="citation-partial" style={{ fontSize: 11 }}>✓</span>;
      tip = `Domain cited by search; exact path could not be confirmed.\n${url}`;
      break;
    case 'citation_replaced':
      icon = <span aria-label="citation-replaced" style={{ fontSize: 11 }}>♻</span>;
      tip = `URL updated from search citation (AI's original URL did not match).\n${url}`;
      linkClass = 'text-orange-600 hover:underline text-xs truncate block max-w-[180px]';
      break;
    case 'bot_blocked_trusted':
    case 'bot_blocked':
      icon = <span aria-label="bot-blocked-trusted" style={{ fontSize: 11 }}>⚠️</span>;
      tip = `Trusted manufacturer/distributor site blocked auto-verification. Click to open.\n${url}`;
      linkClass = 'text-amber-600 hover:underline text-xs truncate block max-w-[180px]';
      break;
    case 'bot_blocked_untrusted':
      icon = <span aria-label="bot-blocked-untrusted" style={{ fontSize: 11 }}>⚠️</span>;
      tip = `URL could not be verified (site blocked us, domain not on trusted list). Manual review recommended.\n${url}`;
      linkClass = 'text-red-600 hover:underline text-xs truncate block max-w-[180px]';
      break;
    case 'no_citations_fallback':
    case 'unverified':
    case 'timeout_unverified':
      icon = <span aria-label="unverified" style={{ fontSize: 11 }}>❓</span>;
      tip = `Link could not be verified — may or may not be correct.\n${url}`;
      linkClass = 'text-gray-500 hover:underline text-xs truncate block max-w-[180px]';
      break;
    default:
      break;
  }

  return (
    <span className="inline-flex items-center gap-1" title={tip}>
      {icon}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={tip}
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {truncateText(url, 25)}
      </a>
    </span>
  );
}

export default function DataTable({ rows, isVerified, onUpdateRow, pendingRowIndexes, originalHeaders }: DataTableProps) {
  const allColumns = useMemo(
    () => buildColumns(isVerified, originalHeaders),
    [isVerified, originalHeaders],
  );
  const { hiddenColumns, toggleColumn, isHidden, setHiddenColumns } =
    useColumnPreferences('datatable_columns');

  // First column (internalItemNumber, col_0) is always forced visible.
  const columns = useMemo(
    () => allColumns.filter((c, i) => i === 0 || !isHidden(c.key)),
    [allColumns, isHidden],
  );

  const { startEdit, commitEdit, cancelEdit, isEditing, getEditedValue } = useEditState();
  const [, forceRender] = useState(0);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 1 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const listRef = useRef<List>(null);
  const listOuterRef = useRef<HTMLDivElement | null>(null);

  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColMenu]);

  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  // Memoize outer/inner element types. Creating a fresh forwardRef() inline on
  // every render causes react-window to tear down and remount its scrollable
  // DOM, which wipes scrollLeft/scrollTop back to 0 on every re-render (e.g.
  // every row hover). That presents as "scroll snaps back to col 0" and
  // "can't reach the last rows".
  const OuterEl = useMemo(
    () =>
      forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        ({ style, children, ...rest }, ref) => (
          <div
            ref={(el) => {
              listOuterRef.current = el;
              if (typeof ref === 'function') ref(el);
              else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            style={{ ...style, WebkitOverflowScrolling: 'touch' }}
            {...rest}
          >
            {children}
          </div>
        ),
      ),
    [],
  );

  // Keep the external header's horizontal offset in lockstep with the List's
  // own horizontal scroll. Re-attach whenever OuterEl is recreated (that
  // happens only if the List's DOM node is torn down — rare, but safe).
  useEffect(() => {
    const outer = listOuterRef.current;
    if (!outer) return;
    const handler = () => setScrollLeft(outer.scrollLeft);
    outer.addEventListener('scroll', handler, { passive: true });
    // Initial sync in case scroll was already non-zero at mount.
    setScrollLeft(outer.scrollLeft);
    return () => outer.removeEventListener('scroll', handler);
  }, [OuterEl]);

  const InnerEl = useMemo(
    () =>
      forwardRef<
        HTMLDivElement,
        React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }
      >(({ style, ...rest }, ref) => (
        <div
          ref={ref}
          style={{
            ...style,
            height: ((style && (style as any).height) || 0) as number,
            width: totalWidth,
          }}
          {...rest}
        />
      )),
    [totalWidth],
  );

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
            borderBottom: '1px solid var(--border, #e2e8f0)',
            background: isHovered ? 'rgba(128,128,128,0.1)' : 'transparent',
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
              const urlStatus = String(
                (row as unknown as Record<string, unknown>).urlValidationStatus || ''
              );
              return (
                <div
                  key={col.key}
                  className="flex-shrink-0 h-full flex items-center px-2.5"
                  style={{ width: col.width }}
                >
                  <WebsiteLink url={value} status={urlStatus} />
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
                    zIndex: 10,
                    backgroundColor: 'var(--bg-surface, #ffffff)',
                    borderRight: '1px solid var(--border, #e2e8f0)',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
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
                    className="w-full bg-bg-surface border border-brand-cyan text-text-primary px-2 py-1 rounded font-mono text-[11px] outline-none"
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, col.key)}
                    onBlur={(e) => handleBlur(e, rowIndex, col.key)}
                  />
                ) : (
                  <span
                    className="font-mono text-[11px] px-2.5 truncate"
                    style={
                      isEmpty
                        ? { opacity: 0.5, fontStyle: 'italic', fontSize: 12 }
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

  const hiddenCount = allColumns.length - columns.length;

  return (
    <div className="bg-bg-surface rounded-lg overflow-hidden mb-3 border border-border flex flex-col h-full max-h-[80vh] sm:max-h-none">
      <style jsx>{`
        @keyframes sp-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-bg-card border-b border-border"
        style={{ position: 'relative', zIndex: 4 }}
      >
        <span className="text-[11px] text-text-muted">
          {rows.length} row{rows.length === 1 ? '' : 's'}
          {hiddenCount > 0 ? ` · ${hiddenCount} column${hiddenCount === 1 ? '' : 's'} hidden` : ''}
        </span>
        <div ref={colMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowColMenu((s) => !s)}
            title="Show / hide columns"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary border border-border rounded bg-transparent cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="5.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="10" y="2" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
            Columns
          </button>
          {showColMenu && (
            <div
              role="menu"
              className="absolute right-0 mt-1 bg-bg-surface border border-border rounded-lg shadow-lg"
              style={{
                minWidth: 220,
                maxHeight: 320,
                overflowY: 'auto',
                zIndex: 100,
                padding: '6px 0',
              }}
            >
              <div
                className="px-3 py-1 text-[10px] uppercase tracking-[0.06em] text-text-muted border-b border-border mb-1"
                style={{ fontWeight: 500 }}
              >
                Show / hide columns
              </div>
              {allColumns.map((col, idx) => {
                const first = idx === 0;
                const hidden = isHidden(col.key);
                return (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-primary select-none"
                    style={{
                      cursor: first ? 'not-allowed' : 'pointer',
                      opacity: first ? 0.6 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!hidden}
                      disabled={first}
                      onChange={() => {
                        if (!first) toggleColumn(col.key);
                      }}
                      style={{ width: 13, height: 13, flexShrink: 0 }}
                    />
                    <span
                      title={(col as any).fullLabel || col.label}
                      className="truncate"
                      style={{ maxWidth: 160 }}
                    >
                      {(col as any).fullLabel || col.label}
                    </span>
                    {first && (
                      <span className="ml-auto text-[10px] text-text-muted">always shown</span>
                    )}
                  </label>
                );
              })}
              <div className="border-t border-border mt-1 px-3 pt-1.5 pb-1">
                <button
                  type="button"
                  onClick={() => setHiddenColumns([])}
                  className="text-[11px] text-text-muted hover:text-text-primary underline bg-transparent border-0 p-0 cursor-pointer"
                >
                  Show all columns
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/*
        Header sits OUTSIDE the virtualized List so its space never competes
        with row 0. Horizontal scroll is mirrored by translating the header
        track to match the List's scrollLeft; the first column counter-
        translates by the same amount so it stays anchored at left:0.
      */}
      <div
        className="bg-bg-card border-b-2 border-border"
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          height: ROW_HEIGHT,
          flexShrink: 0,
          zIndex: 2,
        }}
      >
        <div
          className="flex"
          style={{
            width: totalWidth,
            height: '100%',
            transform: `translateX(${-scrollLeft}px)`,
            willChange: 'transform',
          }}
        >
          {columns.map((col, colIdx) => (
            <div
              key={col.key}
              className="flex-shrink-0 px-2.5 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-muted whitespace-nowrap overflow-hidden"
              style={{
                width: col.width,
                ...(colIdx === 0
                  ? {
                      position: 'relative',
                      transform: `translateX(${scrollLeft}px)`,
                      zIndex: 2,
                      backgroundColor: 'var(--bg-card, #f8fafc)',
                      borderRight: '1px solid var(--border, #e2e8f0)',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                    }
                  : {}),
              }}
            >
              <span
                title={(col as any).fullLabel || col.label}
                style={{ cursor: 'default' }}
              >
                {col.label}
              </span>
              {col.editable && (
                <span style={{ opacity: 0.4, fontSize: 11 }}> ↕</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <List
        ref={listRef}
        height={Math.min(TABLE_HEIGHT, rows.length * ROW_HEIGHT)}
        itemCount={rows.length}
        itemSize={ROW_HEIGHT}
        width="100%"
        outerElementType={OuterEl}
        innerElementType={InnerEl}
        onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
          setVisibleRange({
            start: visibleStartIndex + 1,
            end: visibleStopIndex + 1,
          });
        }}
      >
        {Row}
      </List>
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
