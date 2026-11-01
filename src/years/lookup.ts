import { type FetchLike, lookupEarliestYear } from './musicbrainz';
import { createRateLimiter } from './rateLimit';

type Schedule = <T>(fn: () => Promise<T>) => Promise<T>;

/** One MusicBrainz request per ~1.1 s, as their API asks. */
export function createYearLookup(
  fetchFn: FetchLike,
  schedule: Schedule = createRateLimiter(1100),
): (isrc: string) => Promise<number | null> {
  return (isrc) => schedule(() => lookupEarliestYear(isrc, fetchFn));
}
