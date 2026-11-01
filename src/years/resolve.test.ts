import { describe, expect, it } from 'vitest';
import type { Track } from '../music/types';
import { memoryYearCache } from './cache';
import { resolveYears } from './resolve';

const track = (id: string, sourceYear: number, isrc?: string): Track => ({ id, title: id, artists: ['x'], isrc, sourceYear });

describe('resolveYears', () => {
  it('keeps the earliest year and flags mismatches and misses', async () => {
    const mb: Record<string, number | null> = { R1: 1975, R2: 1991, R3: null };
    const out = await resolveYears(
      [track('remaster', 2011, 'R1'), track('same', 1991, 'R2'), track('miss', 2019, 'R3'), track('noisrc', 2001)],
      { lookup: async (isrc) => mb[isrc], cache: memoryYearCache() },
    );
    expect(out.map((t) => [t.id, t.year, t.mbYear, t.flag])).toEqual([
      ['remaster', 1975, 1975, 'mismatch'],
      ['same', 1991, 1991, 'ok'],
      ['miss', 2019, null, 'nomatch'],
      ['noisrc', 2001, null, 'nomatch'],
    ]);
  });

  it('never moves a year later than the source year', async () => {
    const out = await resolveYears([track('t', 1980, 'R')], { lookup: async () => 1990, cache: memoryYearCache() });
    expect(out[0]).toMatchObject({ year: 1980, mbYear: 1990, flag: 'mismatch' });
  });

  it('uses the cache and skips the lookup', async () => {
    const cache = memoryYearCache();
    await cache.set('R', 1969);
    let calls = 0;
    const out = await resolveYears([track('t', 2009, 'R')], {
      lookup: async () => {
        calls++;
        return 2000;
      },
      cache,
    });
    expect(calls).toBe(0);
    expect(out[0].year).toBe(1969);
  });

  it('caches lookups including misses, but not errors', async () => {
    const cache = memoryYearCache();
    await resolveYears([track('a', 2000, 'HIT'), track('b', 2000, 'MISS'), track('c', 2000, 'ERR')], {
      lookup: async (isrc) => {
        if (isrc === 'ERR') throw new Error('down');
        return isrc === 'HIT' ? 1999 : null;
      },
      cache,
    });
    expect(await cache.get('HIT')).toBe(1999);
    expect(await cache.get('MISS')).toBeNull();
    expect(await cache.get('ERR')).toBeUndefined();
  });

  it('falls back to the source year when MusicBrainz is down', async () => {
    const out = await resolveYears([track('t', 1984, 'R')], {
      lookup: async () => {
        throw new Error('down');
      },
      cache: memoryYearCache(),
    });
    expect(out[0]).toMatchObject({ year: 1984, mbYear: null, flag: 'nomatch' });
  });

  it('reports progress', async () => {
    const seen: string[] = [];
    await resolveYears([track('a', 2000), track('b', 2000)], {
      lookup: async () => null,
      cache: memoryYearCache(),
      onProgress: (d, t) => seen.push(`${d}/${t}`),
    });
    expect(seen).toEqual(['1/2', '2/2']);
  });
});
