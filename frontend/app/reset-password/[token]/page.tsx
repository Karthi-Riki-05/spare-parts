'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { resetPassword } from '@/lib/auth';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = (params?.token as string) || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const r = await resetPassword(token, newPassword);
    if (r.success) {
      router.push('/login?reset=true');
    } else {
      setError(r.error || 'Reset failed.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-[60px] h-[60px] bg-brand-cyan rounded-lg flex items-center justify-center font-bold text-[32px] text-white mx-auto mb-4">
            SP1
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Set a new password</h1>
          <p className="text-sm text-text-secondary">Minimum 8 characters.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-bg-surface border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              required
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-2 text-sm text-brand-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white font-medium py-2 rounded transition-colors text-sm"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
          <p className="text-center text-xs text-text-secondary">
            <Link href="/login" className="text-brand-cyan hover:underline">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
