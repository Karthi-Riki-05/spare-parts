'use client';

import { useEffect, useRef } from 'react';

interface LogEntry {
  text: string;
  type: 'success' | 'fail' | 'change';
}

interface VerificationLogProps {
  entries: LogEntry[];
}

const prefixes: Record<string, string> = {
  success: '\u2713 ',
  fail: '\u2717 ',
  change: '\u270E ',
};

const colors: Record<string, string> = {
  success: 'text-brand-green',
  fail: 'text-brand-orange',
  change: 'text-[#22d3ee]',
};

export default function VerificationLog({ entries }: VerificationLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="bg-bg-surface rounded-[10px] mb-3 overflow-hidden border border-border">
      <div className="px-4 py-2 text-[11px] font-semibold text-text-hint bg-bg-card border-b border-border">
        Verification Log
      </div>
      <div
        ref={containerRef}
        className="max-h-[200px] overflow-y-auto bg-[#0a0c12] py-1"
      >
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`font-mono text-[10px] leading-[1.7] px-4 whitespace-pre-wrap break-all ${colors[entry.type]}`}
          >
            {prefixes[entry.type]}{entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}
