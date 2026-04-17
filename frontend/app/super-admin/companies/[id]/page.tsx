'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { superAdminApi } from '@/lib/superAdminApi';
import { formatDateTimeWithZone, formatDateShort, formatIp } from '@/lib/timeUtils';
import ConfirmDialog, { Toast } from '@/components/ui/ConfirmDialog';
import type { Company, AuditLog } from '@spare-parts/types';

type DialogState =
  | { kind: 'closed' }
  | { kind: 'deactivate' }
  | { kind: 'activate' }
  | { kind: 'delete' }
  | { kind: 'resend' };

type ToastState = { message: string; type: 'success' | 'error' } | null;

// ── Audit action badge config ──────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  company_login:           { label: 'Login',            color: '#065F46', bg: '#D1FAE5' },
  company_login_failed:    { label: 'Login failed',     color: '#991B1B', bg: '#FEE2E2' },
  company_logout:          { label: 'Logout',           color: '#374151', bg: '#F3F4F6' },
  company_created:         { label: 'Created',          color: '#1E40AF', bg: '#DBEAFE' },
  company_confirmed:       { label: 'Confirmed',        color: '#065F46', bg: '#D1FAE5' },
  confirmation_resent:     { label: 'Confirmation resent', color: '#92400E', bg: '#FEF3C7' },
  password_changed:        { label: 'Password changed', color: '#92400E', bg: '#FEF3C7' },
  password_reset:          { label: 'Password reset',   color: '#92400E', bg: '#FEF3C7' },
  password_reset_requested:{ label: 'Reset requested',  color: '#92400E', bg: '#FEF3C7' },
  file_uploaded:           { label: 'File uploaded',    color: '#1E40AF', bg: '#DBEAFE' },
  job_started:             { label: 'Job started',      color: '#1E40AF', bg: '#DBEAFE' },
  job_completed:           { label: 'Job completed',    color: '#065F46', bg: '#D1FAE5' },
  job_failed:              { label: 'Job failed',       color: '#991B1B', bg: '#FEE2E2' },
  excel_downloaded:        { label: 'Downloaded',       color: '#065F46', bg: '#D1FAE5' },
  company_deactivated:     { label: 'Deactivated',      color: '#991B1B', bg: '#FEE2E2' },
  company_activated:       { label: 'Activated',        color: '#065F46', bg: '#D1FAE5' },
  company_deleted:         { label: 'Deleted',          color: '#991B1B', bg: '#FEE2E2' },
  super_admin_login:       { label: 'SA Login',         color: '#6B21A8', bg: '#F3E8FF' },
  super_admin_logout:      { label: 'SA Logout',        color: '#374151', bg: '#F3F4F6' },
};

function ActionBadge({ action }: { action: string }) {
  const c = ACTION_CONFIG[action] || { label: action.replace(/_/g, ' '), color: '#374151', bg: '#F3F4F6' };
  return (
    <span
      className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.color }}
    >
      {c.label}
    </span>
  );
}

function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) {
    return <span className="text-text-secondary text-xs">—</span>;
  }
  const safe = { ...details };
  delete safe.password;
  delete safe.token;
  const entries = Object.entries(safe).slice(0, 3);
  return (
    <div className="text-[11px] text-text-secondary space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k}>
          <span className="font-medium text-text-primary">{k}:</span>{' '}
          {String(v).substring(0, 40)}
        </div>
      ))}
    </div>
  );
}

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [stats, setStats] = useState<{ jobCount: number; rowsProcessed: number; lastJobAt: string | null } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [toast, setToast] = useState<ToastState>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [detail, audit] = await Promise.all([
        superAdminApi.getCompany(id),
        superAdminApi.getAuditLogs({ company_id: id, limit: 50 }),
      ]);
      setCompany(detail.company);
      setStats(detail.stats);
      setAuditLogs(audit.logs);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const closeDialog = () => setDialog({ kind: 'closed' });

  const handleToggleActive = async (reason?: string) => {
    if (!company) return;
    setActionBusy(true);
    try {
      if (dialog.kind === 'deactivate') {
        await superAdminApi.patchCompany(company.id, {
          is_active: false,
          deactivation_reason: reason || 'Deactivated by administrator',
        });
        setToast({ message: `${company.companyName} has been suspended.`, type: 'success' });
      } else {
        await superAdminApi.patchCompany(company.id, { is_active: true });
        setToast({ message: `${company.companyName} has been reactivated.`, type: 'success' });
      }
      await load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setActionBusy(false);
      closeDialog();
    }
  };

  const handleResend = async () => {
    if (!company) return;
    setActionBusy(true);
    try {
      await superAdminApi.resendConfirmation(company.id);
      setToast({ message: 'Confirmation email resent.', type: 'success' });
      await load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setActionBusy(false);
      closeDialog();
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    setActionBusy(true);
    try {
      await superAdminApi.deleteCompany(company.id);
      setToast({ message: `${company.companyName} has been permanently deleted.`, type: 'success' });
      setTimeout(() => router.push('/super-admin/dashboard'), 1000);
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
      setActionBusy(false);
    }
    closeDialog();
  };

  if (loading) return <div className="animate-pulse text-text-secondary">Loading…</div>;
  if (err || !company) return <div className="text-brand-red">{err || 'Company not found.'}</div>;

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <Link href="/super-admin/dashboard" className="text-sm text-text-secondary hover:text-text-primary">
        ← Back to dashboard
      </Link>

      {/* Header card */}
      <section className="bg-bg-surface border border-border rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-text-primary mb-1">{company.companyName}</h1>
            <p className="text-sm text-text-secondary">{company.email}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!company.confirmed && (
              <button onClick={() => setDialog({ kind: 'resend' })} disabled={actionBusy}
                className="text-sm px-3 py-1.5 bg-bg-primary border border-border rounded hover:bg-border disabled:opacity-50">
                Resend confirmation
              </button>
            )}
            <button
              onClick={() => setDialog(company.isActive ? { kind: 'deactivate' } : { kind: 'activate' })}
              disabled={actionBusy}
              className={company.isActive
                ? 'text-sm px-3 py-1.5 bg-brand-red/10 border border-brand-red/30 text-brand-red rounded hover:bg-brand-red/20 disabled:opacity-50'
                : 'text-sm px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded hover:bg-green-500/20 disabled:opacity-50'}
            >
              {company.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button onClick={() => setDialog({ kind: 'delete' })} disabled={actionBusy}
              className="text-sm px-3 py-1.5 bg-brand-red/10 border border-brand-red/30 text-brand-red rounded hover:bg-brand-red/20 disabled:opacity-50">
              Delete
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Info label="Status">
            {company.confirmed ? (
              <span className="text-green-600 dark:text-green-400">Confirmed</span>
            ) : company.confirmationExpiresAt && new Date(company.confirmationExpiresAt) < new Date() ? (
              <span className="text-brand-red">Link expired</span>
            ) : (
              <span className="text-orange-600 dark:text-orange-400">Pending confirmation</span>
            )}
          </Info>
          <Info label="Active">{company.isActive ? 'Yes' : 'No (suspended)'}</Info>
          <Info label="Credits balance">{company.creditsBalance.toLocaleString()}</Info>
          <Info label="Created">{formatDateTimeWithZone(company.createdAt)}</Info>
          <Info label="Confirmed at">{formatDateTimeWithZone(company.confirmedAt)}</Info>
          <Info label="Last login">{formatDateTimeWithZone(company.lastLoginAt)}</Info>
          {!company.isActive && company.deactivatedAt && (
            <Info label="Deactivated at">{formatDateTimeWithZone(company.deactivatedAt)}</Info>
          )}
          {!company.isActive && company.deactivationReason && (
            <Info label="Reason">{company.deactivationReason}</Info>
          )}
        </dl>
      </section>

      {/* Usage stats */}
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Jobs total" value={stats?.jobCount ?? 0} />
        <StatCard label="Rows processed" value={stats?.rowsProcessed ?? 0} />
        <StatCard label="Last job" value={stats?.lastJobAt ? formatDateShort(stats.lastJobAt) : '—'} />
      </section>

      {/* Audit log */}
      <section className="bg-bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">Recent activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg-primary text-left">
              <tr>
                <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">When</th>
                <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Action</th>
                <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase hidden sm:table-cell">IP</th>
                <th className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-secondary">No activity yet.</td></tr>
              )}
              {auditLogs.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-xs text-text-secondary whitespace-nowrap">
                    {formatDateTimeWithZone(l.created_at)}
                  </td>
                  <td className="px-4 py-2.5"><ActionBadge action={l.action} /></td>
                  <td className="px-4 py-2.5 text-xs text-text-secondary hidden sm:table-cell">{formatIp(l.ip_address)}</td>
                  <td className="px-4 py-2.5 max-w-xs"><AuditDetails details={l.details as Record<string, unknown>} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialogs */}
      <ConfirmDialog open={dialog.kind === 'resend'} title="Resend confirmation email"
        message={`Resend the confirmation email to ${company.email}?`}
        confirmLabel="Resend" onConfirm={handleResend} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'deactivate'} title="Deactivate company"
        message={`This will prevent ${company.companyName} from logging in.`}
        inputLabel="Reason for deactivation" inputDefault="Deactivated by administrator"
        confirmLabel="Deactivate" variant="danger"
        onConfirm={(reason) => handleToggleActive(reason)} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'activate'} title="Reactivate company"
        message={`Reactivate ${company.companyName}? They will be able to log in again.`}
        confirmLabel="Activate" onConfirm={() => handleToggleActive()} onCancel={closeDialog} />
      <ConfirmDialog open={dialog.kind === 'delete'} title="Delete company permanently"
        message={`This will permanently delete "${company.companyName}" and all their jobs and results. This action cannot be undone.`}
        confirmLabel="Delete permanently" variant="danger"
        onConfirm={handleDelete} onCancel={closeDialog} />
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary mb-1">{label}</dt>
      <dd className="text-text-primary">{children}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-4">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className="text-xl font-semibold text-text-primary">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
