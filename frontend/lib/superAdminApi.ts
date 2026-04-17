import type { Company, AuditLog, DashboardStats } from '@spare-parts/types';

const API_URL = '/api/super-admin';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `HTTP ${res.status}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return payload as T;
}

export const superAdminApi = {
  async listCompanies(): Promise<Company[]> {
    const r = await req<{ companies: Company[] }>('/companies');
    return r.companies;
  },

  async getCompany(id: string): Promise<{ company: Company; stats: { jobCount: number; rowsProcessed: number; lastJobAt: string | null } }> {
    return req<{ company: Company; stats: { jobCount: number; rowsProcessed: number; lastJobAt: string | null } }>(`/companies/${id}`);
  },

  async createCompany(input: { company_name: string; email: string; password: string }): Promise<{ company: Company }> {
    return req<{ company: Company }>('/companies', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async patchCompany(
    id: string,
    input: { is_active?: boolean; company_name?: string; deactivation_reason?: string }
  ): Promise<{ company: Company }> {
    return req<{ company: Company }>(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async deleteCompany(id: string): Promise<void> {
    await req(`/companies/${id}`, { method: 'DELETE' });
  },

  async resendConfirmation(id: string): Promise<void> {
    await req(`/companies/${id}/resend-confirmation`, { method: 'POST' });
  },

  async getAuditLogs(params: { company_id?: string; action?: string; limit?: number; offset?: number } = {}): Promise<{ logs: AuditLog[]; limit: number; offset: number }> {
    const qs = new URLSearchParams();
    if (params.company_id) qs.set('company_id', params.company_id);
    if (params.action) qs.set('action', params.action);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return req<{ logs: AuditLog[]; limit: number; offset: number }>(`/audit-logs${q ? '?' + q : ''}`);
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const r = await req<DashboardStats>('/dashboard-stats');
    return r;
  },
};
