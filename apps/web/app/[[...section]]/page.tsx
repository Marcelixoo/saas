'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SWRConfig } from 'swr';
import AuthPanel from '../components/AuthPanel';
import Dashboard from '../components/Dashboard';
import { ActiveOrgProvider } from '@/lib/hooks/useActiveOrg';
import { ApiError, getToken, setToken as persistToken, swrFetcher } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { SECTION_LABELS, type SectionId } from '../components/sections/sections';

const VALID_SECTIONS = Object.keys(SECTION_LABELS) as SectionId[];

/**
 * Console entry point. The active section lives in the URL as an optional
 * catch-all segment (`/`, `/metrics`, `/catalog`, …) so a browser refresh keeps
 * you on the same page. Navigation is client-side (`router.push`) within this
 * single route, so the SWR cache and providers persist across section changes.
 */
export default function ConsolePage() {
  const router = useRouter();
  const params = useParams<{ section?: string[] }>();
  const [token, setTokenState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setTokenState(getToken());
    setHydrated(true);
  }, []);

  const raw = params?.section?.[0];
  const section: SectionId =
    raw && VALID_SECTIONS.includes(raw as SectionId) ? (raw as SectionId) : 'metrics';

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
    toast({ variant: 'warning', title: 'Session expired', description: 'Please log in again.' });
  }

  function handleSelect(next: SectionId) {
    router.push(`/${next}`);
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
        <Dashboard section={section} onSelect={handleSelect} onLogout={handleLogout} />
      </ActiveOrgProvider>
    </SWRConfig>
  );
}
