'use client';

import { useEffect, useState } from 'react';
import { SWRConfig } from 'swr';
import AuthPanel from './components/AuthPanel';
import Dashboard from './components/Dashboard';
import { ActiveOrgProvider } from '@/lib/hooks/useActiveOrg';
import { ApiError, getToken, setToken as persistToken, swrFetcher } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function HomePage() {
  const [token, setTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(getToken());
    setHydrated(true);
  }, []);

  function handleAuthenticated(newToken: string) {
    persistToken(newToken);
    setTokenState(newToken);
  }

  function handleLogout() {
    persistToken(null);
    setTokenState(null);
  }

  function handleSessionExpired() {
    persistToken(null);
    setTokenState(null);
    toast({
      variant: 'warning',
      title: 'Session expired',
      description: 'Please log in again.',
    });
  }

  // Avoid a hydration mismatch: the persisted token lives in localStorage,
  // which is only available after mount.
  if (!hydrated) return null;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-5 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Search Console</h1>
          <p className="text-[13px] text-ink-muted">Multi-tenant search platform admin.</p>
        </div>
        <AuthPanel onAuthenticated={handleAuthenticated} />
      </main>
    );
  }

  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            handleSessionExpired();
          }
        },
      }}
    >
      <ActiveOrgProvider>
        <Dashboard onLogout={handleLogout} />
      </ActiveOrgProvider>
    </SWRConfig>
  );
}
