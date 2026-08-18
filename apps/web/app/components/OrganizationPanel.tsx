'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  ApiError,
  Organization,
  SearchHit,
  Usage,
  createOrganization,
  getUsage,
  listOrganizations,
  search,
  seedCatalog,
  updatePlan,
} from '../../lib/api';
import { SAMPLE_CATALOG } from '../../lib/sample-catalog';

type Props = {
  token: string;
  onUnauthorized: () => void;
};

const boxStyle: React.CSSProperties = {
  border: '1px solid #d8d8dc',
  borderRadius: 8,
  padding: '1.25rem',
  background: '#fff',
  marginBottom: '1rem',
  maxWidth: 560,
};

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  marginRight: '0.5rem',
};

export default function OrganizationPanel({ token, onUnauthorized }: Props) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [usage, setUsage] = useState<Usage | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedOrg = organizations.find((o) => o.slug === selectedSlug) || null;

  function handleApiError(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        onUnauthorized();
        return;
      }
      if (err.status === 403) {
        setError('You do not have permission to perform this action.');
        return;
      }
      if (err.status === 404) {
        setError('Organization not found.');
        return;
      }
      if (err.status === 429) {
        setError('Rate limit exceeded. Please slow down.');
        return;
      }
      setError(err.message || fallback);
      return;
    }
    setError(fallback);
  }

  async function refreshOrganizations(selectSlug?: string) {
    try {
      const orgs = await listOrganizations(token);
      setOrganizations(orgs);
      if (selectSlug) {
        setSelectedSlug(selectSlug);
      } else if (!selectedSlug && orgs.length > 0) {
        setSelectedSlug(orgs[0].slug);
      }
    } catch (err) {
      handleApiError(err, 'Failed to load organizations');
    }
  }

  useEffect(() => {
    refreshOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSlug) return;
    refreshUsage(selectedSlug);
    setHits(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  async function refreshUsage(slug: string) {
    try {
      const u = await getUsage(slug, token);
      setUsage(u);
    } catch (err) {
      handleApiError(err, 'Failed to load usage');
    }
  }

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const org = await createOrganization(newOrgName, token);
      setNewOrgName('');
      setShowCreateForm(false);
      await refreshOrganizations(org.slug);
    } catch (err) {
      handleApiError(err, 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  }

  async function handlePlanChange(plan: 'FREE' | 'PRO') {
    if (!selectedOrg) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await updatePlan(selectedOrg.slug, plan, token);
      setOrganizations((prev) =>
        prev.map((o) => (o.slug === updated.slug ? { ...o, plan: updated.plan } : o)),
      );
    } catch (err) {
      handleApiError(err, 'Failed to update plan');
    } finally {
      setBusy(false);
    }
  }

  async function handleSeedCatalog() {
    if (!selectedOrg) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await seedCatalog(selectedOrg.slug, SAMPLE_CATALOG, token);
      setInfo(`Seeded ${result.accepted} products.`);
    } catch (err) {
      handleApiError(err, 'Failed to seed catalog');
    } finally {
      setBusy(false);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!selectedOrg) return;
    setError(null);
    setBusy(true);
    try {
      const result = await search(selectedOrg.slug, query, token);
      setHits(result.hits);
      await refreshUsage(selectedOrg.slug);
    } catch (err) {
      handleApiError(err, 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ color: '#a4262c', marginBottom: '1rem' }} role="alert">
          {error}
        </div>
      )}
      {info && <div style={{ color: '#0b6a0b', marginBottom: '1rem' }}>{info}</div>}

      <div style={boxStyle}>
        <h2>Organization</h2>
        <label htmlFor="organization-select">Select organization</label>
        <select
          id="organization-select"
          data-testid="organization-select"
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem' }}
        >
          <option value="" disabled>
            {organizations.length === 0 ? 'No organizations yet' : 'Choose an organization'}
          </option>
          {organizations.map((org) => (
            <option key={org.id} value={org.slug}>
              {org.name} ({org.plan})
            </option>
          ))}
        </select>

        {!showCreateForm && (
          <button
            data-testid="organization-create"
            type="button"
            style={buttonStyle}
            onClick={() => setShowCreateForm(true)}
          >
            Create organization
          </button>
        )}

        {showCreateForm && (
          <form onSubmit={handleCreateOrg} style={{ marginTop: '0.75rem' }}>
            <label htmlFor="organization-name">Organization name</label>
            <input
              id="organization-name"
              data-testid="organization-name"
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.75rem' }}
              required
            />
            <button data-testid="organization-submit" type="submit" style={buttonStyle} disabled={busy}>
              Save
            </button>
            <button type="button" style={buttonStyle} onClick={() => setShowCreateForm(false)}>
              Cancel
            </button>
          </form>
        )}
      </div>

      {selectedOrg && (
        <>
          <div style={boxStyle}>
            <h2>Plan</h2>
            <p>
              Current plan: <strong data-testid="plan-badge">{selectedOrg.plan}</strong>
            </p>
            <label htmlFor="plan-select">Change plan</label>
            <select
              id="plan-select"
              data-testid="plan-select"
              value={selectedOrg.plan}
              onChange={(e) => handlePlanChange(e.target.value as 'FREE' | 'PRO')}
              style={{ display: 'block', padding: '0.5rem' }}
              disabled={busy}
            >
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
            </select>
          </div>

          <div style={boxStyle}>
            <h2>Catalog</h2>
            <p>Seed a small synthetic product catalog for this organization.</p>
            <button
              data-testid="seed-catalog"
              type="button"
              style={buttonStyle}
              onClick={handleSeedCatalog}
              disabled={busy}
            >
              Seed sample catalog
            </button>
          </div>

          <div style={boxStyle}>
            <h2>Search</h2>
            <form onSubmit={handleSearch}>
              <input
                data-testid="search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products..."
                style={{ padding: '0.5rem', width: '70%', marginRight: '0.5rem' }}
              />
              <button data-testid="search-submit" type="submit" style={buttonStyle} disabled={busy}>
                Search
              </button>
            </form>
            {hits === null && <p>No search performed yet.</p>}
            {hits !== null && hits.length === 0 && <p>No results found.</p>}
            <div data-testid="search-results" style={{ marginTop: '1rem' }}>
              {hits !== null &&
                hits.map((hit) => (
                  <div key={hit.id} data-testid="search-hit" style={{ padding: '0.25rem 0' }}>
                    {String(hit.title)}
                  </div>
                ))}
            </div>
          </div>

          <div style={boxStyle}>
            <h2>Usage</h2>
            <p>
              Search count: <span data-testid="usage-search-count">{usage ? usage.searchCount : 0}</span>
            </p>
            <p>
              Rate-limited requests:{' '}
              <span data-testid="usage-rate-limit-count">{usage ? usage.rateLimitedCount : 0}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
