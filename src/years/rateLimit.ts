const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Serializes calls and spaces their start times by at least `intervalMs` (MusicBrainz allows ~1 req/s). */
export function createRateLimiter(intervalMs: number, sleep = realSleep, now: () => number = Date.now) {
  let nextAt = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = nextAt - now();
      if (wait > 0) await sleep(wait);
      nextAt = now() + intervalMs;
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
