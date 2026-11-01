import { describe, expect, it } from 'vitest';
import { createYearLookup } from './lookup';

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
});
