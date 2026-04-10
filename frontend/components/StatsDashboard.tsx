'use client';

import type { ProcessingStats } from '@spare-parts/types';
import StatCard from './ui/StatCard';

interface StatsDashboardProps {
  stats: ProcessingStats | null;
  rowCount: number;
}

export default function StatsDashboard({ stats, rowCount }: StatsDashboardProps) {
  const s = stats || {
    totalRows: rowCount,
    webVerified: 0,
    emptyCells: 0,
    scoreAbove90: 0,
    score50to89: 0,
    scoreBelow50: 0,
    officialSourceFound: 0,
    externalSourceFound: 0,
    notFound: 0,
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-1.5 sm:gap-2 mb-3">
      <StatCard 
        value={s.totalRows === 0 ? '...' : s.totalRows} 
        label="Total Rows" 
        color="text-brand-cyan" 
      />
      <StatCard value={s.webVerified} label="Web Verified" color="text-brand-teal" />
      <StatCard value={s.emptyCells} label="Empty Cells" color="text-brand-red" />
      <StatCard value={s.scoreAbove90} label="Score ≥90" color="text-brand-green" />
      <StatCard value={s.score50to89} label="Score 50-89" color="text-brand-yellow" />
      <StatCard value={s.scoreBelow50} label="Score <50" color="text-brand-orange" />
      <StatCard value={s.officialSourceFound} label="Official" color="text-brand-blue" />
      <StatCard value={s.externalSourceFound} label="External" color="text-brand-purple" />
      <StatCard value={s.notFound} label="Not Found" color="text-text-muted" />
    </div>
  );
}
