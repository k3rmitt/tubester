import { describe, expect, it } from 'vitest';
import { scriptedFetch } from '../util/http';
import { createYearLookup, RETRY_DELAYS_MS } from './lookup';

const direct = <T>(fn: () => Promise<T>) => fn();
const found = { status: 200, body: { recordings: [{ 'first-release-date': '1982-11-30' }] } };

describe('createYearLookup', () => {
  it('queries MusicBrainz through the scheduler', async () => {
    const urls: string[] = [];
    let scheduled = 0;
    const lookup = createYearLookup(
      async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ recordings: [{ 'first-release-date': '1975-10-31' }] }) };
      },
      (fn) => {
        scheduled++;
        return fn();
      },
    );
    expect(await lookup('GBUM71029604')).toBe(1975);
    expect(scheduled).toBe(1);
    expect(urls[0]).toContain('isrc:GBUM71029604');
  });

  it('retries a busy server with growing waits, then succeeds', async () => {
    const { fetchFn, calls } = scriptedFetch([{ status: 503 }, { status: 429 }, found]);
    const waits: number[] = [];
    const lookup = createYearLookup(fetchFn, direct, async (ms) => {
      waits.push(ms);
    });
    expect(await lookup('USSM19902991')).toBe(1982);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([2000, 4000]);
  });

  it('retries network errors', async () => {
    let n = 0;
    const lookup = createYearLookup(
      async () => {
        n++;
        if (n === 1) throw new TypeError('Failed to fetch');
        return { ok: true, status: 200, json: async () => found.body };
      },
      direct,
      async () => undefined,
    );
    expect(await lookup('X')).toBe(1982);
    expect(n).toBe(2);
  });

  it('gives up after the last retry and reports the error', async () => {
    const { fetchFn, calls } = scriptedFetch(Array.from({ length: 4 }, () => ({ status: 503 })));
    const waits: number[] = [];
    const lookup = createYearLookup(fetchFn, direct, async (ms) => {
      waits.push(ms);
    });
    await expect(lookup('X')).rejects.toThrow('503');
    expect(calls).toHaveLength(1 + RETRY_DELAYS_MS.length);
    expect(waits).toEqual([2000, 4000, 8000]);
  });

  it('does not retry other HTTP errors', async () => {
    const { fetchFn, calls } = scriptedFetch([{ status: 400 }]);
    const lookup = createYearLookup(fetchFn, direct, async () => undefined);
    await expect(lookup('X')).rejects.toThrow('400');
    expect(calls).toHaveLength(1);
  });

  it('sends each retry through the scheduler', async () => {
    const { fetchFn } = scriptedFetch([{ status: 503 }, found]);
    let scheduled = 0;
    const lookup = createYearLookup(
      fetchFn,
      (fn) => {
        scheduled++;
        return fn();
      },
      async () => undefined,
    );
    await lookup('X');
    expect(scheduled).toBe(2);
  });
});
