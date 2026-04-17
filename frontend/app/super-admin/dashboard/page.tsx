'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { superAdminApi } from '@/lib/superAdminApi';
import { formatDateShort } from '@/lib/timeUtils';
import ConfirmDialog, { Toast } from '@/components/ui/ConfirmDialog';
import type { Company, DashboardStats } from '@spare-parts/types';

type DialogState =
  | { kind: 'closed' }
  | { kind: 'deactivate'; company: Company }
  | { kind: 'activate'; company: Company }
  | { kind: 'delete'; company: Company }
  | { kind: 'resend'; company: Company };

type ToastState = { message: string; type: 'success' | 'error' } | null;

export default function SuperAdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [s, c] = await Promise.all([
        superAdminApi.getDashboardStats(),
        superAdminApi.listCompanies(),
      ]);
      setStats(s);
      setCompanies(c);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeDialog = () => setDialog({ kind: 'closed' });

  const handleResend = async () => {
    if (dialog.kind !== 'resend') return;
    try {
      await superAdminApi.resendConfirmation(dialog.company.id);
      setToast({ message: 'Confirmation email resent.', type: 'success' });
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
    closeDialog();
  };

  const handleToggleActive = async (reason?: string) => {
    if (dialog.kind === 'deactivate') {
      try {
        await superAdminApi.patchCompany(dialog.company.id, {
          is_active: false,
          deactivation_reason: reason || 'Deactivated by administrator',
        });
        setToast({ message: `${dialog.company.companyName} has been suspended.`, type: 'success' });
        load();
      } catch (e) {
        setToast({ message: (e as Error).message, type: 'error' });
      }
    } else if (dialog.kind === 'activate') {
      try {
        await superAdminApi.patchCompany(dialog.company.id, { is_active: true });
        setToast({ message: `${dialog.company.companyName} has been reactivated.`, type: 'success' });
        load();
      } catch (e) {
        setToast({ message: (e as Error).message, type: 'error' });
      }
    }
    closeDialog();
  };

  const handleDelete = async () => {
    if (dialog.kind !== 'delete') return;
    try {
      await superAdminApi.deleteCompany(dialog.company.id);
      setToast({ message: `${dialog.company.companyName} has been permanently deleted.`, type: 'success' });
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
    closeDialog();
  };

  if (loading) return <div className="animate-pulse text-text-secondary">Loading…</div>;
  if (err) return <div className="text-brand-red">{err}</div>;

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      {/* Stats row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Companies" value={stats?.companies.total_companies ?? 0} />
        <StatCard label="Confirmed" value={stats?.companies.confirmed_companies ?? 0} />
        <StatCard label="Active" value={stats?.companies.active_companies ?? 0} />
        <StatCard label="Jobs today" value={stats?.jobs.jobs_today ?? 0} />
      </section>

      {/* Company list */}
      <section className="bg-bg-surface border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Companies</h2>
          <Link href="/super-admin/companies/new"
            className="text-sm bg-purple-600 hover:bg-purple-700 text-white py-1.5 px-3 rounded">
            + Add Company
          </Link>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-border">
          {companies.length === 0 && (
            <div className="px-4 py-8 text-center text-text-secondary text-sm">No companies yet.</div>
          )}
          {companies.map((c) => (
            <div key={c.id} className="p-4">
              <div className="mb-2">
                <Link href={`/super-admin/companies/${c.id}`} className="text-sm font-medium text-brand-cyan hover:underline">
                  {c.companyName}
                </Link>
                <p className="text-xs text-text-secondary truncate">{c.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <StatusBadge company={c} />
                {c.isActive
                  ? <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">Active</span>
                  : <span className="text-xs px-2 py-0.5 rounded bg-brand-red/15 text-brand-red">Suspended</span>
                }
                <span className="text-xs text-text-secondary py-0.5">{c.jobCount ?? 0} jobs</span>
              </div>
              <p className="text-xs text-text-secondary mb-3">Created: {formatDateShort(c.createdAt)}</p>
              <div className="flex gap-2 flex-wrap">
                <Link href={`/super-admin/companies/${c.id}`}
                  className="text-xs px-3 py-1.5 rounded border border-border text-text-primary hover:bg-bg-primary">
                  View
                </Link>
                {!c.confirmed && (
                  <button onClick={() => setDialog({ kind: 'resend', company: c })}
                    className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-bg-primary">
                    Resend
                  </button>
                )}
                <button
                  onClick={() => setDialog(c.isActive ? { kind: 'deactivate', company: c } : { kind: 'activate', company: c })}
                  className="text-xs px-3 py-1.5 rounded border border-border text-text-secondary hover:bg-bg-primary">
                  {c.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => setDialog({ kind: 'delete', company: c })}
                  className="text-xs px-3 py-1.5 rounded border border-brand-red/30 text-brand-red hover:bg-brand-red/5">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-primary text-left">
              <tr>
                <Th>Company</Th>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Active</Th>
                <Th>Jobs</Th>
                <Th>Created</Th>
                <Th className="text-right pr-4">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-text-secondary">No companies yet.</td></tr>
              )}
              {companies.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-bg-primary/40">
                  <Td>
                    <Link href={`/super-admin/companies/${c.id}`} className="text-brand-cyan hover:underline font-medium">
                      {c.companyName}
                    </Link>
                  </Td>
                  <Td className="text-text-secondary">{c.email}</Td>
                  <Td><StatusBadge company={c} /></Td>
                  <Td>
                    {c.isActive
                      ? <span className="text-green-600 dark:text-green-400">Active</span>
                      : <span className="text-brand-red">Suspended</span>}
                  </Td>
                  <Td>{c.jobCount ?? 0}</Td>
                  <Td className="text-text-secondary text-xs">{formatDateShort(c.createdAt)}</Td>
                  <Td className="text-right pr-4 space-x-2 whitespace-nowrap">
                    <Link href={`/super-admin/companies/${c.id}`} className="text-xs text-brand-cyan hover:underline">View</Link>
                    {!c.confirmed && (
                      <button onClick={() => setDialog({ kind: 'resend', company: c })}
                        className="text-xs text-text-secondary hover:text-text-primary">Resend</button>
                    )}
                    <button
                      onClick={() => setDialog(c.isActive ? { kind: 'deactivate', company: c } : { kind: 'activate', company: c })}
                      className="text-xs text-text-secondary hover:text-text-primary">
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => setDialog({ kind: 'delete', company: c })}
                      className="text-xs text-red-500 hover:text-red-400">Delete</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialogs */}
      <ConfirmDialog open={dialog.kind === 'resend'} title="Resend confirmation email"
        message={dialog.kind === 'resend' ? `Resend the confirmation email to ${dialog.company.email}?` : ''}
        confirmLabel="Resend" onConfirm={handleResend} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'deactivate'} title="Deactivate company"
        message={dialog.kind === 'deactivate' ? `This will prevent ${dialog.company.companyName} from logging in.` : ''}
        inputLabel="Reason for deactivation" inputDefault="Deactivated by administrator"
        confirmLabel="Deactivate" variant="danger"
        onConfirm={(reason) => handleToggleActive(reason)} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'activate'} title="Reactivate company"
        message={dialog.kind === 'activate' ? `Reactivate ${dialog.company.companyName}? They will be able to log in again.` : ''}
        confirmLabel="Activate" onConfirm={() => handleToggleActive()} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'delete'} title="Delete company permanently"
        message={dialog.kind === 'delete' ? `This will permanently delete "${dialog.company.companyName}" and all their jobs and results. This action cannot be undone.` : ''}
        confirmLabel="Delete permanently" variant="danger"
        onConfirm={handleDelete} onCancel={closeDialog} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-4">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className="text-2xl font-bold text-text-primary">{value.toLocaleString()}</div>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wide ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function StatusBadge({ company }: { company: Company }) {
  if (company.confirmed) {
    return <span className="text-xs px-2 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">Confirmed</span>;
  }
  const expired = company.confirmationExpiresAt && new Date(company.confirmationExpiresAt) < new Date();
  if (expired) {
    return <span className="text-xs px-2 py-0.5 rounded bg-brand-red/15 text-brand-red">Link expired</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-400">Pending</span>;
}
