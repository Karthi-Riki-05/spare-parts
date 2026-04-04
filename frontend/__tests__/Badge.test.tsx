import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../components/ui/Badge';

describe('Badge', () => {
  test('renders label text', () => {
    render(<Badge label="Format A (Correct)" variant="a" />);
    expect(screen.getByText('Format A (Correct)')).toBeDefined();
  });

  test('format-a variant has green styling', () => {
    const { container } = render(<Badge label="A" variant="a" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-brand-green');
  });

  test('format-b variant has orange styling', () => {
    const { container } = render(<Badge label="B" variant="b" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-brand-orange');
  });

  test('format-c variant has cyan styling', () => {
    const { container } = render(<Badge label="C" variant="c" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-brand-cyan');
  });

  test('default variant has muted styling', () => {
    const { container } = render(<Badge label="5 rows" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-text-muted');
  });
});
