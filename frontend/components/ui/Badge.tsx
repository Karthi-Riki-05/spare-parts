'use client';

import { clsx } from 'clsx';

interface BadgeProps {
  label: string;
  variant?: 'a' | 'b' | 'c' | 'default';
  className?: string;
}

const styles: Record<string, string> = {
  a: 'bg-emerald-950 text-brand-green',
  b: 'bg-orange-950 text-brand-orange',
  c: 'bg-sky-950 text-brand-cyan',
  default: 'bg-border text-text-muted',
};

export default function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-block text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider',
        styles[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}
