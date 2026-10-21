export type SearchPlan = 'FREE' | 'PRO';
export type SearchSliResult = 'good' | 'excluded' | 'error';

export interface SearchSliContext {
  tenantId: string;
  plan: SearchPlan;
}

/** Distinct from Fastify's default "request completed" access log. */
export const SEARCH_SLI_LOG_MESSAGE = 'search completed';

export const SEARCH_SLI_OPERATION = 'search';

/**
 * Classify a customer-facing search status for the per-tenant SLO.
 *
 * 2xx/3xx count as successful availability samples and enter the latency
 * distribution. 4xx (including quota 429s) are excluded from both SLIs so
 * a tenant sitting on its plan limit does not burn the error budget.
 * 5xx (including 502/503 from search-api) count as availability failures
 * and are kept out of the latency distribution.
 */
export function classifySearchSli(status: number): SearchSliResult {
  if (status >= 200 && status < 400) return 'good';
  if (status >= 400 && status < 500) return 'excluded';
  return 'error';
}
