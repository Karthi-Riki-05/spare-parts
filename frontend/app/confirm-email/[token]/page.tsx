'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { confirmEmail } from '@/lib/auth';

type State =
  | { kind: 'loading' }
  | { kind: 'success'; email?: string; alreadyConfirmed?: boolean }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' };

export default function ConfirmEmailPage() {
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const token = params?.token;
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    (async () => {
      const r = await confirmEmail(token);
      if (r.ok) {
        setState({ kind: 'success', email: r.email, alreadyConfirmed: r.alreadyConfirmed });
      } else if (r.reason === 'expired') {
        setState({ kind: 'expired' });
      } else if (r.reason === 'server_error') {
        setState({ kind: 'error' });
      } else {
        setState({ kind: 'invalid' });
      }
    })();
  }, [params]);

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-bg-surface border border-border rounded-lg p-8 text-center">
        {state.kind === 'loading' && (
          <>
            <div className="animate-pulse text-text-secondary">Confirming your email…</div>
          </>
        )}

        {state.kind === 'success' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">
              {state.alreadyConfirmed ? 'Already confirmed' : 'Email confirmed'}
            </h1>
            <p className="text-sm text-text-secondary mb-6">
              {state.email ? <>Account <strong>{state.email}</strong> is ready.</> : 'Your account is ready.'}
            </p>
            <Link
              href="/login?confirmed=true"
              className="inline-block bg-brand-cyan hover:bg-brand-cyan/90 text-white font-medium py-2 px-4 rounded text-sm"
            >
              Continue to sign in
            </Link>
          </>
        )}

        {state.kind === 'expired' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-orange-500/15 text-orange-500 flex items-center justify-center text-3xl">
              ⏱
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Link expired</h1>
            <p className="text-sm text-text-secondary mb-6">
              This confirmation link has expired. Please contact your administrator to resend a new link.
            </p>
            <Link href="/login" className="text-sm text-brand-cyan hover:underline">
              Back to sign in
            </Link>
          </>
        )}

        {state.kind === 'invalid' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-red/15 text-brand-red flex items-center justify-center text-3xl">
              ✕
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Invalid link</h1>
            <p className="text-sm text-text-secondary mb-6">
              This confirmation link is not recognised. It may have already been used.
            </p>
            <Link href="/login" className="text-sm text-brand-cyan hover:underline">
              Back to sign in
            </Link>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-brand-red/15 text-brand-red flex items-center justify-center text-3xl">
              !
            </div>
            <h1 className="text-xl font-bold text-text-primary mb-2">Something went wrong</h1>
            <p className="text-sm text-text-secondary mb-6">
              Please try again in a moment. If it keeps failing, contact support.
            </p>
            <Link href="/login" className="text-sm text-brand-cyan hover:underline">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
