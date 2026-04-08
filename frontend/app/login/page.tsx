'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login, getUser } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (user) {
        router.push('/');
      }
      setIsChecking(false);
    };
    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Invalid credentials');
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="w-[60px] h-[60px] bg-brand-cyan rounded-lg flex items-center justify-center font-bold text-[32px] text-white mx-auto mb-4">
            SP1
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Spare Parts</h1>
          <p className="text-sm text-text-secondary">Web Verifier</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="tawdev@gmail.com"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              required
            />
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
                required
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

          {/* Error Message */}
          {error && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-2 text-sm text-brand-red">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white font-medium py-2 rounded transition-colors text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-text-secondary mt-6">
          AI-powered spare parts verification system
        </p>
      </div>
    </div>
  );
}
