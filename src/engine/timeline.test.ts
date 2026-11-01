import { describe, expect, it } from 'vitest';
import { insertCard, isCorrectSlot, isValidSlot } from './timeline';
import type { Card } from './types';

const tl: Card[] = [
  { trackId: 'a', year: 1977 },
  { trackId: 'b', year: 1985 },
  { trackId: 'c', year: 1999 },
];

describe('isValidSlot', () => {
  it('accepts integers from 0 to length', () => {
    expect([0, 1, 2, 3].map((s) => isValidSlot(tl, s))).toEqual([true, true, true, true]);
  });
  it('rejects out-of-range and non-integer slots', () => {
    expect([-1, 4, 1.5, Number.NaN].map((s) => isValidSlot(tl, s))).toEqual([false, false, false, false]);
  });
});

describe('isCorrectSlot', () => {
  it('checks the year falls between neighbours', () => {
    expect(isCorrectSlot(tl, 0, 1960)).toBe(true);
    expect(isCorrectSlot(tl, 2, 1991)).toBe(true);
    expect(isCorrectSlot(tl, 3, 2010)).toBe(true);
    expect(isCorrectSlot(tl, 1, 1991)).toBe(false);
    expect(isCorrectSlot(tl, 0, 1980)).toBe(false);
  });
  it('accepts an equal year on either side', () => {
    expect(isCorrectSlot(tl, 1, 1985)).toBe(true);
    expect(isCorrectSlot(tl, 2, 1985)).toBe(true);
  });
  it('accepts any slot on an empty timeline only at 0', () => {
    expect(isCorrectSlot([], 0, 1991)).toBe(true);
    expect(isCorrectSlot([], 1, 1991)).toBe(false);
  });
  it('rejects invalid slots', () => {
    expect(isCorrectSlot(tl, 1.5, 1980)).toBe(false);
    expect(isCorrectSlot(tl, -1, 1960)).toBe(false);
  });
});

describe('insertCard', () => {
  it('inserts at the sorted position without mutating', () => {
    const out = insertCard(tl, { trackId: 'x', year: 1991 });
    expect(out.map((c) => c.year)).toEqual([1977, 1985, 1991, 1999]);
    expect(tl).toHaveLength(3);
  });
  it('puts an equal year after existing ones', () => {
    const out = insertCard(tl, { trackId: 'x', year: 1985 });
    expect(out.map((c) => c.trackId)).toEqual(['a', 'b', 'x', 'c']);
  });
});
