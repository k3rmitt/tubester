import { describe, expect, it } from 'vitest';
import { stillFree } from './stealPicks';

describe('stillFree', () => {
  it('drops picked slots that another team took first', () => {
    const turn = { slot: 0, steals: [{ teamId: 'A', slot: 2 }] };
    expect(stillFree(new Set([1, 2]), turn)).toEqual([1]);
    expect(stillFree(new Set([2]), turn)).toEqual([]);
    expect(stillFree(new Set([0, 3]), turn)).toEqual([3]);
  });
});
