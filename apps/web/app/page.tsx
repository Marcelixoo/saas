'use client';

import { useEffect, useState } from 'react';
import AuthPanel from './components/AuthPanel';
import OrganizationPanel from './components/OrganizationPanel';
import { getToken, setToken as persistToken } from '../lib/api';

export default function HomePage() {
  const [token, setTokenState] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTokenState(getToken());
    setHydrated(true);
  }, []);

  function handleAuthenticated(newToken: string) {
    persistToken(newToken);
    setTokenState(newToken);
    setAuthError(null);
  }

  function handleUnauthorized() {
    persistToken(null);
    setTokenState(null);
    setAuthError('Your session expired. Please log in again.');
  }

  if (!hydrated) {
    return null;
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1>Search SaaS Admin</h1>
      {authError && (
        <div style={{ color: '#a4262c', marginBottom: '1rem' }} role="alert">
          {authError}
        </div>
      )}
      {!token && (
        <AuthPanel onAuthenticated={handleAuthenticated} onError={setAuthError} />
      )}
      {token && (
        <OrganizationPanel token={token} onUnauthorized={handleUnauthorized} />
      )}
    </main>
  );
}
