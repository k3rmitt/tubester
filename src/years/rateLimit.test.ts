import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('spaces calls by the interval and preserves order', async () => {
    let t = 0;
    const sleep = async (ms: number) => {
      t += ms;
    };
    const schedule = createRateLimiter(1100, sleep, () => t);
    const calls: number[] = [];
    await Promise.all([1, 2, 3].map((n) => schedule(async () => calls.push(t) && n)));
    expect(calls).toEqual([0, 1100, 2200]);
  });
  it('keeps going after a failing call', async () => {
    let t = 0;
    const schedule = createRateLimiter(
      10,
      async (ms) => {
        t += ms;
      },
      () => t,
    );
    await expect(schedule(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(schedule(async () => 42)).resolves.toBe(42);
  });
});
