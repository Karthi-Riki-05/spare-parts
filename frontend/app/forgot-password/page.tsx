'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const r = await forgotPassword(email);
    setMessage(r.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-[60px] h-[60px] bg-brand-cyan rounded-lg flex items-center justify-center font-bold text-[32px] text-white mx-auto mb-4">
            SP1
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Forgot password</h1>
          <p className="text-sm text-text-secondary">
            We&apos;ll email you a link to reset it.
          </p>
        </div>

        {message ? (
          <div className="bg-bg-surface border border-border rounded-lg p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-cyan/15 text-brand-cyan flex items-center justify-center text-xl">
              ✉
            </div>
            <p className="text-sm text-text-primary mb-4">{message}</p>
            <Link href="/login" className="text-sm text-brand-cyan hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="you@company.com"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
                required
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white font-medium py-2 rounded transition-colors text-sm"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-center text-xs text-text-secondary">
              Remembered it? <Link href="/login" className="text-brand-cyan hover:underline">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
