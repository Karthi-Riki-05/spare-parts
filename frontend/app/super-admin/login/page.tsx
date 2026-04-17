'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saLogin } from '@/lib/superAdminAuth';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await saLogin(email, password);
    if (r.success) {
      router.push('/super-admin/dashboard');
    } else {
      setError(r.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-[60px] h-[60px] bg-purple-600 rounded-lg flex items-center justify-center font-bold text-[28px] text-white mx-auto mb-4">
            SA
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Super Admin</h1>
          <p className="text-sm text-text-secondary">Platform administration</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
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
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-2 text-sm text-brand-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-medium py-2 rounded transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-text-secondary mt-6">
          This is a privileged portal. Do not share credentials.
        </p>
      </div>
    </div>
  );
}
