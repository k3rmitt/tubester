import { describe, expect, it } from 'vitest';
import type { ResolvedTrack } from '../years/resolve';
import { gameTracks, reviewSummary, setInclude, setYear, toReviewRows } from './review';

const resolved: ResolvedTrack[] = [
  { id: 'a', title: 'A', artists: ['x'], isrc: 'I1', sourceYear: 2011, mbYear: 1975, year: 1975, flag: 'mismatch' },
  { id: 'b', title: 'B', artists: ['y'], isrc: 'I2', sourceYear: 1991, mbYear: 1991, year: 1991, flag: 'ok' },
  { id: 'c', title: 'C', artists: ['z'], sourceYear: 2019, mbYear: null, year: 2019, flag: 'nomatch' },
];

describe('review model', () => {
  it('keeps the album cover in game tracks', () => {
    const rows = toReviewRows([{ ...resolved[1], cover: 'https://i.scdn.co/b.jpg' }]);
    expect(gameTracks(rows)[0].cover).toBe('https://i.scdn.co/b.jpg');
  });

  it('starts with every track included at its resolved year', () => {
    const rows = toReviewRows(resolved);
    expect(rows.map((r) => [r.id, r.include, r.chosenYear])).toEqual([
      ['a', true, 1975],
      ['b', true, 1991],
      ['c', true, 2019],
    ]);
    expect(reviewSummary(rows)).toEqual({ total: 3, toCheck: 2, included: 3 });
  });

  it('edits a year only to a plausible integer', () => {
    const rows = toReviewRows(resolved);
    expect(setYear(rows, 'c', 1984, 2026).find((r) => r.id === 'c')?.chosenYear).toBe(1984);
    for (const bad of [1899, 2027, 1984.5, Number.NaN]) expect(setYear(rows, 'c', bad, 2026)).toBe(rows);
  });

  it('excludes tracks and builds game tracks with the chosen years', () => {
    let rows = toReviewRows(resolved);
    rows = setInclude(rows, 'c', false);
    rows = setYear(rows, 'a', 1976, 2026);
    expect(reviewSummary(rows).included).toBe(2);
    expect(gameTracks(rows)).toEqual([
      { id: 'a', title: 'A', artists: ['x'], isrc: 'I1', sourceYear: 2011, year: 1976 },
      { id: 'b', title: 'B', artists: ['y'], isrc: 'I2', sourceYear: 1991, year: 1991 },
    ]);
  });
});
