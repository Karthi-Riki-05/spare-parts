'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { superAdminApi } from '@/lib/superAdminApi';

export default function NewCompanyPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const strength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!companyName || !email || !password) return;
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await superAdminApi.createCompany({ company_name: companyName, email, password });
      router.push('/super-admin/dashboard');
    } catch (e) {
      setErr((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link href="/super-admin/dashboard" className="text-sm text-text-secondary hover:text-text-primary">
          ← Back to dashboard
        </Link>
      </div>

      <div className="bg-bg-surface border border-border rounded-lg p-6">
        <h1 className="text-lg font-bold text-text-primary mb-1">Create company</h1>
        <p className="text-sm text-text-secondary mb-6">
          A confirmation email will be sent to the company email address.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Company name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={loading}
              required
              placeholder="Acme Industrial AB"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              placeholder="contact@acme.example"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Temporary password
              <span className="text-text-secondary font-normal"> — user can change after first login</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-text-secondary hover:text-text-primary text-sm"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2">
                <div className="h-1 bg-border rounded overflow-hidden">
                  <div
                    className={`h-full transition-all ${strength.color}`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  Strength: <span className="font-medium text-text-primary">{strength.label}</span>
                  {strength.hints.length > 0 && (
                    <> — try adding: {strength.hints.join(', ')}</>
                  )}
                </div>
              </div>
            )}
          </div>

          {err && (
            <div className="bg-brand-red/10 border border-brand-red/30 rounded p-2 text-sm text-brand-red">{err}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || password.length < 8}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white font-medium py-2 px-4 rounded text-sm"
            >
              {loading ? 'Creating…' : 'Create company'}
            </button>
            <Link href="/super-admin/dashboard" className="text-sm text-text-secondary hover:text-text-primary">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function passwordStrength(pw: string) {
  let score = 0;
  const hints: string[] = [];
  if (pw.length >= 8) score++; else hints.push('8+ chars');
  if (/[A-Z]/.test(pw)) score++; else hints.push('an uppercase letter');
  if (/[0-9]/.test(pw)) score++; else hints.push('a number');
  if (/[^A-Za-z0-9]/.test(pw)) score++; else hints.push('a symbol');

  const table = [
    { label: 'Weak',     color: 'bg-brand-red',  percent: 25 },
    { label: 'Weak',     color: 'bg-brand-red',  percent: 25 },
    { label: 'Fair',     color: 'bg-orange-500', percent: 50 },
    { label: 'Good',     color: 'bg-yellow-500', percent: 75 },
    { label: 'Strong',   color: 'bg-green-500',  percent: 100 },
  ];
  return { ...table[score], hints };
}
