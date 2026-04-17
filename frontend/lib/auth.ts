const API_URL = '/api';

export interface User {
  id?: string;
  email: string;
  companyName?: string;
  creditsBalance?: number;
}

export interface AuthError {
  error: string;
  status: number;
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
    if (!res.ok) {
      return { ok: false, status: res.status, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload as T };
  } catch (err) {
    return { ok: false, status: 0, error: 'Network error' };
  }
}

export async function getUser(): Promise<User | null> {
  const r = await request<{ user: User }>('/auth/me');
  if (!r.ok) return null;
  return r.data.user || null;
}

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string; status?: number }> {
  const r = await request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return { success: false, error: r.error, status: r.status };
  return { success: true, user: r.data.user };
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout error:', err);
  }
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  const r = await request<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  // Backend always returns a stock message regardless — mirror that here.
  if (!r.ok) return { success: true, message: 'If that email exists, a reset link has been sent.' };
  return { success: true, message: r.data.message };
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const r = await request<{ success: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true };
}

export async function confirmEmail(
  token: string
): Promise<{ ok: boolean; email?: string; reason?: 'expired' | 'invalid' | 'server_error'; alreadyConfirmed?: boolean }> {
  const r = await request<{ ok: boolean; email?: string; reason?: string; alreadyConfirmed?: boolean }>(
    `/auth/confirm/${encodeURIComponent(token)}`
  );
  if (!r.ok) {
    // 400 with a reason key from backend
    return { ok: false, reason: 'invalid' };
  }
  const d = r.data as { ok: boolean; email?: string; reason?: string; alreadyConfirmed?: boolean };
  return {
    ok: !!d.ok,
    email: d.email,
    alreadyConfirmed: !!d.alreadyConfirmed,
    reason: d.reason as 'expired' | 'invalid' | 'server_error' | undefined,
  };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const r = await request<{ success: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true };
}
