'use client';

import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'cyan' | 'green' | 'red' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  cyan: 'bg-brand-cyan text-white hover:brightness-110',
  green: 'bg-emerald-800 text-brand-green hover:brightness-110',
  red: 'bg-transparent border border-brand-red text-brand-red hover:brightness-110',
  ghost: 'bg-border text-text-muted hover:bg-border-hover',
};

export default function Button({
  variant = 'cyan',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-all duration-150 font-sans cursor-pointer',
        variantStyles[variant],
        size === 'sm' ? 'px-3 py-1.5 text-xs min-h-[32px]' : 'px-5 py-2.5 text-[13px] min-h-[44px]',
        (disabled || loading) && 'opacity-30 cursor-not-allowed',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
