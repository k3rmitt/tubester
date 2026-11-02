import { HttpError } from '../util/http';
import { type FetchLike, lookupEarliestYear } from './musicbrainz';
import { createRateLimiter } from './rateLimit';

type Schedule = <T>(fn: () => Promise<T>) => Promise<T>;
type Sleep = (ms: number) => Promise<void>;

/** Waits before each retry when MusicBrainz refuses a request (it often answers 503 to browsers). */
export const RETRY_DELAYS_MS = [2000, 4000, 8000];

const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Busy server, rate limited, or a network error: worth another try. */
function isRetryable(e: unknown): boolean {
  if (e instanceof HttpError) return e.status === 503 || e.status === 429;
  return true;
}

/** One MusicBrainz request per ~1.1 s, as their API asks; refused requests are retried with growing waits. */
export function createYearLookup(
  fetchFn: FetchLike,
  schedule: Schedule = createRateLimiter(1100),
  sleep: Sleep = realSleep,
): (isrc: string) => Promise<number | null> {
  return async (isrc) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await schedule(() => lookupEarliestYear(isrc, fetchFn));
      } catch (e) {
        const wait = RETRY_DELAYS_MS[attempt];
        if (wait === undefined || !isRetryable(e)) throw e;
        await sleep(wait);
      }
    }
  };
}
