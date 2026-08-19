export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export type Plan = 'FREE' | 'PRO';
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  role?: Role;
};

export type Usage = {
  organizationId: string;
  searchCount: number;
  rateLimitedCount: number;
  indexCount: number;
};

/** One day's usage counts. `date` is an ISO `YYYY-MM-DD` (UTC) day key. */
export type UsagePoint = {
  date: string;
  search: number;
  index: number;
  rateLimited: number;
};

export type UsageTimeseries = {
  organizationId: string;
  days: number;
  points: UsagePoint[];
};

/** Small-window granularities for the fine-grained (line-chart) timeseries. */
export type UsageWindow = '1h' | '3h' | '24h' | '7d';

/** One bucket's usage counts in window mode. `ts` is an ISO 8601 bucket start. */
export type UsageWindowPoint = {
  ts: string;
  search: number;
  index: number;
  rateLimited: number;
};

export type UsageWindowTimeseries = {
  organizationId: string;
  window: UsageWindow;
  points: UsageWindowPoint[];
};

export type SearchHit = { id: string; title: string; [key: string]: unknown };

/** Facet name -> (value -> count), as returned by Meilisearch facet distribution. */
export type FacetDistribution = Record<string, Record<string, number>>;

export type SearchResponse = {
  query: string;
  hits: SearchHit[];
  total: number;
  /** Present only when `facets` were requested. */
  facetDistribution?: FacetDistribution;
  limit?: number;
  offset?: number;
};

export type SearchParams = {
  q: string;
  /** Meilisearch filter expression, e.g. `category = "Shoes" AND price < 50`. */
  filter?: string;
  /** Sort directives, e.g. `["price:asc"]`. */
  sort?: string[];
  limit?: number;
  offset?: number;
  /** Facet fields to compute a distribution for, e.g. `["category", "brand"]`. */
  facets?: string[];
};

export type CatalogDocument = {
  id: string;
  title: string;
  body?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  price?: number;
  imageUrl?: string;
};

export type CatalogListResponse = {
  documents: CatalogDocument[];
  total: number;
  offset: number;
  limit: number;
};

export type Member = {
  userId: string;
  email: string;
  name: string;
  role: Role;
};

export type MembersResponse = { members: Member[] };

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'admin_ui_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  const authToken = token === undefined ? getToken() : token;
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      code = body?.error?.code;
      message = body?.error?.message || message;
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export { request };

/**
 * Default SWR fetcher: GETs a control-plane path with the persisted bearer
 * token. SWR keys are therefore the raw request paths (e.g. `/organizations`),
 * which keeps the cache legible and lets any hook invalidate by path.
 */
export function swrFetcher<T>(path: string): Promise<T> {
  return request<T>(path);
}

export async function register(
  email: string,
  password: string,
  name: string,
): Promise<{ user: { id: string; email: string; name: string }; token: string }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: { id: string; email: string; name: string }; token: string }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export type CurrentUser = { id: string; email: string; name: string };

export async function listOrganizations(token?: string): Promise<Organization[]> {
  return request('/organizations', {}, token);
}

export async function createOrganization(
  name: string,
  token?: string,
): Promise<Organization> {
  return request(
    '/organizations',
    { method: 'POST', body: JSON.stringify({ name }) },
    token,
  );
}

export async function updatePlan(
  slug: string,
  plan: Plan,
  token?: string,
): Promise<Organization> {
  return request(
    `/organizations/${slug}/plan`,
    { method: 'PATCH', body: JSON.stringify({ plan }) },
    token,
  );
}

/** Rename an organization (OWNER/ADMIN). Backend: Agent D (Settings). */
export async function updateOrganization(
  slug: string,
  name: string,
  token?: string,
): Promise<Organization> {
  return request(
    `/organizations/${slug}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    token,
  );
}

export async function getUsage(slug: string, token?: string): Promise<Usage> {
  return request(`/organizations/${slug}/usage`, {}, token);
}

/** Per-day usage counts for the last `days` days. Backend: Agent A (Metrics). */
export async function getUsageTimeseries(
  slug: string,
  days = 14,
  token?: string,
): Promise<UsageTimeseries> {
  return request(`/organizations/${slug}/usage/timeseries?days=${days}`, {}, token);
}

/** Fine-grained (sub-day-capable) usage counts for a small time window. */
export async function getUsageTimeseriesWindow(
  slug: string,
  usageWindow: UsageWindow,
  token?: string,
): Promise<UsageWindowTimeseries> {
  return request(`/organizations/${slug}/usage/timeseries?window=${usageWindow}`, {}, token);
}

export async function search(
  slug: string,
  params: SearchParams,
  token?: string,
): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  qs.set('q', params.q);
  if (params.filter) qs.set('filter', params.filter);
  if (params.sort && params.sort.length > 0) qs.set('sort', params.sort.join(','));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));
  if (params.facets && params.facets.length > 0) qs.set('facets', params.facets.join(','));
  return request(`/organizations/${slug}/search?${qs.toString()}`, {}, token);
}

/** Paginated view of a tenant's indexed documents. Backend: Agent C (Catalog). */
export async function listDocuments(
  slug: string,
  offset = 0,
  limit = 20,
  token?: string,
): Promise<CatalogListResponse> {
  return request(
    `/organizations/${slug}/documents?offset=${offset}&limit=${limit}`,
    {},
    token,
  );
}

export async function listMembers(slug: string, token?: string): Promise<MembersResponse> {
  return request(`/organizations/${slug}/members`, {}, token);
}

export async function inviteMember(
  slug: string,
  email: string,
  role: Role,
  token?: string,
): Promise<{ member: Member }> {
  return request(
    `/organizations/${slug}/members`,
    { method: 'POST', body: JSON.stringify({ email, role }) },
    token,
  );
}

export async function removeMember(
  slug: string,
  userId: string,
  token?: string,
): Promise<void> {
  return request(
    `/organizations/${slug}/members/${userId}`,
    { method: 'DELETE' },
    token,
  );
}

// Seeds a catalog in chunks so large samples (e.g. the ~500-product real
// catalog sample) stay well under any single request/body limit. The first
// chunk carries `reset=true`, which truncates the tenant index before indexing
// so a re-seed rebuilds the catalog from scratch instead of layering duplicate
// or stale documents onto the previous seed. Returns the total number of
// accepted documents across all chunks.
export async function seedCatalog(
  slug: string,
  documents: CatalogDocument[],
  token?: string,
): Promise<{ accepted: number }> {
  const CHUNK_SIZE = 200;
  let accepted = 0;
  for (let i = 0; i < documents.length; i += CHUNK_SIZE) {
    const chunk = documents.slice(i, i + CHUNK_SIZE);
    const reset = i === 0;
    const result = await request<{ accepted: number }>(
      `/organizations/${slug}/documents/batch${reset ? '?reset=true' : ''}`,
      { method: 'POST', body: JSON.stringify({ documents: chunk }) },
      token,
    );
    accepted += result.accepted;
  }
  return { accepted };
}
