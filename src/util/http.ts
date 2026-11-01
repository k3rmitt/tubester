export interface HttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HttpFetch = (url: string, init?: HttpInit) => Promise<HttpResponse>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const browserFetch: HttpFetch = (url, init) => fetch(url, init);

/** Test helper: answers calls in order with the scripted responses and records them. */
export function scriptedFetch(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: HttpInit }[] = [];
  const queue = [...responses];
  const fetchFn: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    const r = queue.shift();
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetchFn, calls };
}
