/**
 * Minimal structural HTTP boundary so adapters can be exercised with a fake and
 * the real Node global `fetch` without adding a runtime dependency (ADR-0005,
 * ADR-0006). Node's global `fetch` is assignable to this type.
 */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;
