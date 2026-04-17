'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { saMe, saLogout } from '@/lib/superAdminAuth';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLoginPage = pathname === '/super-admin/login';

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    (async () => {
      const me = await saMe();
      if (!me) {
        router.replace('/super-admin/login');
        return;
      }
      setEmail(me.email);
      setLoading(false);
    })();
  }, [router, isLoginPage]);

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await saLogout();
    router.push('/super-admin/login');
  };

  if (isLoginPage) return <>{children}</>;

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
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          {/* Logo */}
          <Link href="/super-admin/dashboard" className="flex items-center gap-2">
            <div className="w-[28px] h-[28px] bg-purple-600 rounded flex items-center justify-center font-bold text-[11px] text-white">
              SA
            </div>
            <span className="text-sm font-semibold text-text-primary">Super Admin</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <nav className="flex items-center gap-3 text-sm">
              <NavLink href="/super-admin/dashboard" current={pathname}>Dashboard</NavLink>
              <NavLink href="/super-admin/companies/new" current={pathname}>+ New Company</NavLink>
            </nav>
            <span className="text-text-secondary text-sm">{email}</span>
            <button onClick={handleLogout} className="text-sm text-text-secondary hover:text-text-primary">
              Sign out
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-bg-primary"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-border bg-bg-surface px-4 py-3 space-y-1">
            <Link href="/super-admin/dashboard"
              className="block py-2.5 px-3 rounded-lg text-sm text-text-primary hover:bg-bg-primary">
              Dashboard
            </Link>
            <Link href="/super-admin/companies/new"
              className="block py-2.5 px-3 rounded-lg text-sm text-purple-500 font-medium hover:bg-purple-500/10">
              + New Company
            </Link>
            <div className="border-t border-border pt-2 mt-2">
              <p className="px-3 py-1 text-xs text-text-secondary truncate">{email}</p>
              <button onClick={handleLogout}
                className="w-full text-left py-2.5 px-3 rounded-lg text-sm text-brand-red hover:bg-brand-red/5">
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function NavLink({ href, current, children }: { href: string; current: string; children: React.ReactNode }) {
  const isActive = current === href || current.startsWith(href + '/');
  return (
    <Link href={href}
      className={isActive ? 'text-purple-600 font-medium' : 'text-text-secondary hover:text-text-primary'}>
      {children}
    </Link>
  );
}
