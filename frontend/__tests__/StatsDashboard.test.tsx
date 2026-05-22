import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsDashboard from '../components/StatsDashboard';
import type { ProcessingStats } from '@spare-parts/types';

describe('StatsDashboard', () => {
  test('renders all 9 stat cards', () => {
    const stats: ProcessingStats = {
      totalRows: 50,
      webVerified: 40,
      emptyCells: 5,
      scoreAbove90: 20,
      score70to89: 15,
      scoreBelow70: 5,
      officialSourceFound: 18,
      externalSourceFound: 12,
      notFound: 10,
    };
    render(<StatsDashboard stats={stats} rowCount={50} />);

    expect(screen.getByText('50')).toBeDefined();     // totalRows
    expect(screen.getByText('40')).toBeDefined();     // webVerified
    expect(screen.getAllByText('5')).toHaveLength(2);  // emptyCells=5 + scoreBelow70=5
    expect(screen.getByText('20')).toBeDefined();     // scoreAbove90
    expect(screen.getByText('15')).toBeDefined();     // score70to89
    expect(screen.getByText('18')).toBeDefined();     // official
    expect(screen.getByText('12')).toBeDefined();     // external
    expect(screen.getByText('10')).toBeDefined();     // notFound
  });

  test('renders zero state when no stats', () => {
    render(<StatsDashboard stats={null} rowCount={25} />);
    expect(screen.getByText('25')).toBeDefined(); // totalRows from rowCount
    // All other cards should show 0
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(8); // 8 other stat cards
  });

  test('renders label text for each card', () => {
    render(<StatsDashboard stats={null} rowCount={0} />);
    expect(screen.getByText('Total Rows')).toBeDefined();
    expect(screen.getByText('Web Verified')).toBeDefined();
    expect(screen.getByText('Empty Cells')).toBeDefined();
    expect(screen.getByText(/Score ≥90/)).toBeDefined();
    expect(screen.getByText(/Score 70-89/)).toBeDefined();
    expect(screen.getByText(/Score <70/)).toBeDefined();
    expect(screen.getByText('Official')).toBeDefined();
    expect(screen.getByText('External')).toBeDefined();
    expect(screen.getByText('Not Found')).toBeDefined();
  });
});
