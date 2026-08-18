import { request } from 'undici';
import { config } from '../config';
import { Errors } from './errors';

export interface SearchHit {
  id: string;
  title: string;
  [key: string]: unknown;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  total: number;
  /** Present only when `facets` were requested. */
  facetDistribution?: Record<string, Record<string, number>>;
  limit?: number;
  offset?: number;
}

/** Optional forwarded search params (CONTRACT.md §3/§4). */
export interface SearchOptions {
  filter?: string;
  sort?: string[];
  limit?: number;
  offset?: number;
  facets?: string[];
}

export interface BatchDocument {
  id: string;
  title: string;
  body?: string;
  author?: string;
  tags?: string[];
  brand?: string;
  category?: string;
  price?: number;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface CatalogDocument {
  id: string;
  title: string;
  price?: number;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface CatalogListResult {
  documents: CatalogDocument[];
  total: number;
  offset: number;
  limit: number;
}

export interface SearchApiClient {
  search(tenantId: string, query: string, opts?: SearchOptions): Promise<SearchResponse>;
  indexBatch(tenantId: string, documents: BatchDocument[]): Promise<{ accepted: number }>;
  listDocuments(tenantId: string, offset: number, limit: number): Promise<CatalogListResult>;
}

async function toApiError(statusCode: number, body: string): Promise<never> {
  if (statusCode >= 500 || statusCode === 0) {
    throw Errors.unavailable(`Search API is unavailable: ${body}`);
  }
  throw Errors.badGateway(`Search API returned an error: ${body}`);
}

/**
 * HTTP client for the internal Go search API. The tenant id passed here is
 * ALWAYS the trusted, server-resolved organization UUID — never anything
 * derived from client-supplied headers.
 */
export function createSearchApiClient(baseUrl: string = config.searchApiUrl): SearchApiClient {
  return {
    async search(tenantId: string, query: string, opts?: SearchOptions): Promise<SearchResponse> {
      const qs = new URLSearchParams();
      qs.set('q', query);
      if (opts?.filter) qs.set('filter', opts.filter);
      if (opts?.sort && opts.sort.length > 0) qs.set('sort', opts.sort.join(','));
      if (typeof opts?.limit === 'number') qs.set('limit', String(opts.limit));
      if (typeof opts?.offset === 'number') qs.set('offset', String(opts.offset));
      if (opts?.facets && opts.facets.length > 0) qs.set('facets', opts.facets.join(','));

      let res;
      try {
        res = await request(`${baseUrl}/internal/search?${qs.toString()}`, {
          method: 'GET',
          headers: { 'X-Tenant-ID': tenantId },
        });
      } catch (err) {
        throw Errors.unavailable(`Failed to reach search API: ${(err as Error).message}`);
      }
      const bodyText = await res.body.text();
      if (res.statusCode >= 400) {
        return toApiError(res.statusCode, bodyText);
      }
      return JSON.parse(bodyText) as SearchResponse;
    },

    async indexBatch(tenantId: string, documents: BatchDocument[]): Promise<{ accepted: number }> {
      let res;
      try {
        res = await request(`${baseUrl}/internal/documents/batch`, {
          method: 'POST',
          headers: { 'X-Tenant-ID': tenantId, 'content-type': 'application/json' },
          body: JSON.stringify({ documents }),
        });
      } catch (err) {
        throw Errors.unavailable(`Failed to reach search API: ${(err as Error).message}`);
      }
      const bodyText = await res.body.text();
      if (res.statusCode >= 400) {
        return toApiError(res.statusCode, bodyText);
      }
      return JSON.parse(bodyText) as { accepted: number };
    },

    async listDocuments(tenantId: string, offset: number, limit: number): Promise<CatalogListResult> {
      let res;
      try {
        res = await request(`${baseUrl}/internal/documents?offset=${offset}&limit=${limit}`, {
          method: 'GET',
          headers: { 'X-Tenant-ID': tenantId },
        });
      } catch (err) {
        throw Errors.unavailable(`Failed to reach search API: ${(err as Error).message}`);
      }
      const bodyText = await res.body.text();
      if (res.statusCode >= 400) {
        return toApiError(res.statusCode, bodyText);
      }
      return JSON.parse(bodyText) as CatalogListResult;
    },
  };
}
