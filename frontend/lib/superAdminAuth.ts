const API_URL = '/api';

export interface SuperAdminUser {
  id: string;
  email: string;
  role: 'super_admin';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<
  { ok: true; data: T } | { ok: false; status: number; error: string }
> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: payload.error || `HTTP ${res.status}` };
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, status: 0, error: 'Network error' };
  }
}

export async function saLogin(
  email: string,
  password: string
): Promise<{ success: boolean; user?: SuperAdminUser; error?: string }> {
  const r = await request<{ user: SuperAdminUser }>('/super-admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true, user: r.data.user };
}

export async function saLogout(): Promise<void> {
  try {
    await fetch(`${API_URL}/super-admin/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
}

export async function saMe(): Promise<SuperAdminUser | null> {
  const r = await request<{ user: SuperAdminUser }>('/super-admin/me');
  if (!r.ok) return null;
  return r.data.user || null;
}
