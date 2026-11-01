import { describe, expect, it } from 'vitest';
import { seededRandom, shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRandom(7));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('is deterministic for a given seed', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seededRandom(3))).toEqual(shuffle([1, 2, 3, 4, 5, 6], seededRandom(3)));
  });
});

describe('seededRandom', () => {
  it('yields numbers in [0, 1)', () => {
    const r = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
