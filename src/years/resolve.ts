import type { Track } from '../music/types';
import type { YearCache } from './cache';

export type YearFlag = 'ok' | 'mismatch' | 'nomatch';

export interface ResolvedTrack extends Track {
  /** Year used in the game: the earliest of MusicBrainz and source. */
  year: number;
  mbYear: number | null;
  flag: YearFlag;
}

export interface ResolveDeps {
  lookup: (isrc: string) => Promise<number | null>;
  cache: YearCache;
  onProgress?: (done: number, total: number) => void;
}

export async function resolveYears(tracks: Track[], deps: ResolveDeps): Promise<ResolvedTrack[]> {
  const out: ResolvedTrack[] = [];
  for (const t of tracks) {
    const mbYear = t.isrc ? await yearFor(t.isrc, deps) : null;
    out.push({
      ...t,
      mbYear,
      year: mbYear === null ? t.sourceYear : Math.min(mbYear, t.sourceYear),
      flag: mbYear === null ? 'nomatch' : mbYear === t.sourceYear ? 'ok' : 'mismatch',
    });
    deps.onProgress?.(out.length, tracks.length);
  }
  return out;
}

async function yearFor(isrc: string, { lookup, cache }: ResolveDeps): Promise<number | null> {
  const cached = await cache.get(isrc);
  if (cached !== undefined) return cached;
  try {
    const year = await lookup(isrc);
    await cache.set(isrc, year);
    return year;
  } catch {
    return null; // MusicBrainz down: fall back, do not cache
  }
}
