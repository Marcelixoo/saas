export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO';
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
};

export type Usage = {
  organizationId: string;
  searchCount: number;
  rateLimitedCount: number;
  indexCount: number;
};

export type SearchHit = { id: string; title: string; [key: string]: unknown };

export type SearchResponse = {
  query: string;
  hits: SearchHit[];
  total: number;
};

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
  plan: 'FREE' | 'PRO',
  token?: string,
): Promise<Organization> {
  return request(
    `/organizations/${slug}/plan`,
    { method: 'PATCH', body: JSON.stringify({ plan }) },
    token,
  );
}

export async function getUsage(slug: string, token?: string): Promise<Usage> {
  return request(`/organizations/${slug}/usage`, {}, token);
}

export async function search(
  slug: string,
  q: string,
  token?: string,
): Promise<SearchResponse> {
  return request(
    `/organizations/${slug}/search?q=${encodeURIComponent(q)}`,
    {},
    token,
  );
}

export async function seedCatalog(
  slug: string,
  documents: Array<{ id: string; title: string; brand?: string; category?: string }>,
  token?: string,
): Promise<{ accepted: number }> {
  return request(
    `/organizations/${slug}/documents/batch`,
    { method: 'POST', body: JSON.stringify({ documents }) },
    token,
  );
}
