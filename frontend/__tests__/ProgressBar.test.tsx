import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import ProgressBar from '../components/ui/ProgressBar';

describe('ProgressBar', () => {
  function getFillStyle(container: HTMLElement) {
    // The fill div is the inner div inside the track div
    const fill = container.querySelector('[style]') as HTMLElement;
    return fill?.getAttribute('style') || '';
  }

  test('0% renders with width 0', () => {
    const { container } = render(<ProgressBar value={0} />);
    expect(getFillStyle(container)).toContain('width: 0%');
  });

  test('50% renders with width 50%', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(getFillStyle(container)).toContain('width: 50%');
  });

  test('100% renders with width 100%', () => {
    const { container } = render(<ProgressBar value={100} />);
    expect(getFillStyle(container)).toContain('width: 100%');
  });

  test('value clamped above 100', () => {
    const { container } = render(<ProgressBar value={150} />);
    expect(getFillStyle(container)).toContain('width: 100%');
  });

  test('value clamped below 0', () => {
    const { container } = render(<ProgressBar value={-10} />);
    expect(getFillStyle(container)).toContain('width: 0%');
  });
});
