'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/auth';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Show banners from ?confirmed=true / ?reset=true / ?logout=true redirects.
    if (params.get('confirmed') === 'true') setFlash('Email confirmed. You can sign in now.');
    else if (params.get('reset') === 'true') setFlash('Password updated. Sign in with your new password.');
    else if (params.get('logout') === 'true') setFlash('Signed out.');
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFlash(null);
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  const isUnconfirmed = error.toLowerCase().includes('not confirmed');
  const isSuspended = error.toLowerCase().includes('suspended');

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-[60px] h-[60px] bg-brand-cyan rounded-lg flex items-center justify-center font-bold text-[32px] text-white mx-auto mb-4">
            SP1
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Company Sign In</h1>
          <p className="text-sm text-text-secondary">Spare Parts Web Verifier</p>
        </div>

        {flash && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded p-3 text-sm text-green-600 dark:text-green-400">
            {flash}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="Enter Email"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-text-primary">Password</label>
              <Link
                href="/forgot-password"
                className="text-xs text-brand-cyan hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-3 top-2.5 text-text-secondary hover:text-text-primary text-sm disabled:opacity-50"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-3 text-sm text-brand-red space-y-1">
              <div>{error}</div>
              {isUnconfirmed && (
                <div className="text-xs text-text-secondary">
                  Check your inbox for the confirmation email from your administrator. If the link expired, ask for a new one.
                </div>
              )}
              {isSuspended && (
                <div className="text-xs text-text-secondary">
                  Your account has been suspended. Please contact your administrator.
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white font-medium py-2 rounded transition-colors text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary mt-6">
          AI-powered spare parts verification system
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <LoginInner />
    </Suspense>
  );
}
