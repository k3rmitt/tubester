import { describe, expect, it } from 'vitest';
import { lookupEarliestYear, type FetchLike } from './musicbrainz';

const respond = (body: unknown, status = 200): FetchLike => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('lookupEarliestYear', () => {
  it('returns the earliest first-release year across recordings', async () => {
    const fetchFn = respond({
      recordings: [{ 'first-release-date': '2011-05-02' }, { 'first-release-date': '1975-10-31' }, { 'first-release-date': '1975' }],
    });
    expect(await lookupEarliestYear('GBUM71029604', fetchFn)).toBe(1975);
  });
  it('ignores recordings without a usable date', async () => {
    const fetchFn = respond({ recordings: [{}, { 'first-release-date': '' }, { 'first-release-date': '1991-09-10' }] });
    expect(await lookupEarliestYear('X', fetchFn)).toBe(1991);
  });
  it('returns null when nothing matches', async () => {
    expect(await lookupEarliestYear('X', respond({ recordings: [] }))).toBeNull();
  });
  it('queries by ISRC as JSON', async () => {
    let seen = '';
    await lookupEarliestYear('USSM19922509', async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ recordings: [] }) };
    });
    expect(seen).toBe('https://musicbrainz.org/ws/2/recording?query=isrc:USSM19922509&fmt=json&limit=25');
  });
  it('throws on HTTP errors so callers do not cache them', async () => {
    await expect(lookupEarliestYear('X', respond({}, 503))).rejects.toThrow('MusicBrainz 503');
  });
});
