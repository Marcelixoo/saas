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
}

export interface BatchDocument {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  [key: string]: unknown;
}

export interface SearchApiClient {
  search(tenantId: string, query: string): Promise<SearchResponse>;
  indexBatch(tenantId: string, documents: BatchDocument[]): Promise<{ accepted: number }>;
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
    async search(tenantId: string, query: string): Promise<SearchResponse> {
      let res;
      try {
        res = await request(`${baseUrl}/internal/search?q=${encodeURIComponent(query)}`, {
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
  };
}
