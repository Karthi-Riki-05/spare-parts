'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getUser, changePassword, logout, type User } from '@/lib/auth';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Change-password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Usage stats (rough): derived from listJobs
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [totalRows, setTotalRows] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (!u) {
        router.replace('/login');
        return;
      }
      setUser(u);
      setLoading(false);

      try {
        const res = await api.listJobs();
        const jobs = res.jobs as { totalRows: number }[];
        setJobCount(jobs.length);
        setTotalRows(jobs.reduce((sum, j) => sum + (j.totalRows || 0), 0));
      } catch {
        // ignore — stats are best-effort
      }
    })();
  }, [router]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    if (newPassword.length < 8) {
      setPwMessage({ type: 'err', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'err', text: 'New passwords do not match.' });
      return;
    }
    setPwSaving(true);
    const r = await changePassword(currentPassword, newPassword);
    setPwSaving(false);
    if (r.success) {
      setPwMessage({ type: 'ok', text: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPwMessage({ type: 'err', text: r.error || 'Change failed.' });
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login?logout=true');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-surface">
        <div className="flex items-center justify-between px-4 py-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-2.5">
            <Link href="/" className="w-[30px] h-[30px] bg-brand-cyan rounded flex items-center justify-center font-bold text-[13px] text-white">
              SP1
            </Link>
            <h1 className="text-base font-semibold text-text-primary">Profile</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-brand-cyan hover:underline">Back to app</Link>
            <button onClick={handleLogout} className="text-sm text-text-secondary hover:text-text-primary ml-4">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Company info */}
        <section className="bg-bg-surface border border-border rounded-lg p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wide">Company info</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-text-secondary mb-1">Company name</dt>
              <dd className="text-text-primary">{user?.companyName || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary mb-1">Email</dt>
              <dd className="text-text-primary">{user?.email}</dd>
            </div>
          </dl>
        </section>

        {/* Usage stats */}
        <section className="bg-bg-surface border border-border rounded-lg p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wide">Usage</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Stat label="Total jobs" value={jobCount == null ? '—' : jobCount.toString()} />
            <Stat label="Rows submitted" value={totalRows == null ? '—' : totalRows.toLocaleString()} />
            <Stat label="Credits balance" value={(user?.creditsBalance ?? 0).toString()} />
          </div>
        </section>

        {/* Change password */}
        <section className="bg-bg-surface border border-border rounded-lg p-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wide">Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={pwSaving}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwSaving}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pwSaving}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:opacity-50"
              />
            </div>

            {pwMessage && (
              <div
                className={
                  pwMessage.type === 'ok'
                    ? 'bg-green-500/10 border border-green-500/30 rounded p-2 text-sm text-green-600 dark:text-green-400'
                    : 'bg-brand-red/10 border border-brand-red/30 rounded p-2 text-sm text-brand-red'
                }
              >
                {pwMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={pwSaving}
              className="bg-brand-cyan hover:bg-brand-cyan/90 disabled:bg-brand-cyan/50 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
            >
              {pwSaving ? 'Saving…' : 'Save password'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-primary border border-border rounded p-4">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}
