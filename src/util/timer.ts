/** Schedules `fn` after `ms`; returns a cancel function. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

export const browserTimer: SetTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Manual timers for tests: `fire(ms)` runs the oldest pending timer with that delay. */
export function fakeTimers() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const setTimer: SetTimer = (fn, ms) => {
    const t = { fn, ms, cancelled: false };
    timers.push(t);
    return () => {
      t.cancelled = true;
    };
  };
  const pending = () => timers.filter((t) => !t.cancelled).map((t) => t.ms);
  const fire = (ms?: number) => {
    const t = timers.find((x) => !x.cancelled && (ms === undefined || x.ms === ms));
    if (!t) throw new Error(`no pending timer${ms === undefined ? '' : ` of ${ms}ms`}`);
    t.cancelled = true;
    t.fn();
  };
  return { setTimer, pending, fire };
}
