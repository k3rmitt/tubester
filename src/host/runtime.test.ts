import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/testkit';
import type { GameState } from '../engine/types';
import { HostRuntime, type RuntimeDeps } from './runtime';

const PLAYERS = { p1: 'A', p2: 'B', p3: 'C' };

function fakeDeps() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const changes: GameState[] = [];
  let t = 0;
  const deps: RuntimeDeps = {
    now: () => t,
    meta: { t1: { title: 'Smells Like Teen Spirit', artists: ['Nirvana'] } },
    stealWindowMs: 5000,
    revealMs: 5000,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    onChange: (s) => changes.push(s),
  };
  const fire = () => {
    const t = timers.filter((x) => !x.cancelled).shift();
    if (!t) throw new Error('no pending timer');
    t.cancelled = true;
    t.fn();
  };
  const pending = () => timers.filter((x) => !x.cancelled).map((x) => x.ms);
  const advance = (ms: number) => {
    t += ms;
  };
  return { deps, timers, changes, fire, pending, advance };
}

describe('HostRuntime', () => {
  it('maps players to teams and rejects unknown players', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.handleIntent('p2', { type: 'place', slot: 1 })).toEqual({ ok: true });
    expect(rt.handleIntent('p1', { type: 'place', slot: 0 })).toEqual({ ok: false, reason: 'not your turn' });
    expect(rt.handleIntent('nobody', { type: 'skip' })).toEqual({ ok: false, reason: 'unknown player' });
  });

  it('notifies on every successful change only', () => {
    const { deps, changes } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p1', { type: 'place', slot: 0 });
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    expect(changes).toHaveLength(1);
  });

  it('awards the naming bonus via the fuzzy matcher', () => {
    const { deps, fire } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 0 });
    rt.handleIntent('p2', { type: 'lockIn', guess: { title: 'smells like teen sprit', artist: 'nirvana' } });
    fire(); // close steals
    expect(rt.state.lastOutcome?.nameBonus).toBe(true);
    expect(rt.state.teams.find((t) => t.id === 'B')?.tokens).toBe(3);
  });

  it('gives no bonus without a guess', () => {
    const { deps, fire } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.state.lastOutcome?.nameBonus).toBe(false);
  });

  it('runs the steal window then the reveal, then the next turn', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    expect(rt.state.phase).toBe('stealWindow');
    expect(pending()).toEqual([5000]);
    expect(rt.handleIntent('p3', { type: 'steal', slots: [0] })).toEqual({ ok: true });
    expect(rt.state.phase).toBe('stealWindow');
    expect(rt.handleIntent('p1', { type: 'steal', slots: [] })).toEqual({ ok: true });
    expect(rt.state.phase).toBe('reveal'); // every other team answered: the window closed early
    expect(pending()).toEqual([5000]);
    fire();
    expect(rt.state.phase).toBe('deciding');
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('does not arm a reveal timer when the game finishes', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame({ cardsToWin: 2 }), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.state.phase).toBe('finished');
    expect(pending()).toEqual([]);
  });

  it('host commands bypass player mapping', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.command({ type: 'passTurn' })).toEqual({ ok: true });
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('nextTurn command cancels the pending reveal timer', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.command({ type: 'nextTurn' })).toEqual({ ok: true });
    expect(pending()).toEqual([]);
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('builds per-player views', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.viewFor('p3').viewerTeamId).toBe('C');
    expect(rt.viewFor(null).viewerTeamId).toBeNull();
    expect(JSON.stringify(rt.viewFor('p2'))).not.toContain('Smells Like Teen Spirit');
  });

  it('restores from serialize() and re-arms the steal timer after a host reload', () => {
    const a = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, a.deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    const saved = rt.serialize();
    rt.dispose();
    expect(a.pending()).toEqual([]);

    const b = fakeDeps();
    const restored = HostRuntime.restore(saved, b.deps);
    expect(restored.state.phase).toBe('stealWindow');
    expect(b.pending()).toEqual([5000]);
    b.fire();
    expect(restored.state.phase).toBe('reveal');
    expect(restored.handleIntent('p2', { type: 'skip' })).toEqual({ ok: false, reason: 'not allowed during reveal' });
  });

  it('restore rejects garbage', () => {
    expect(() => HostRuntime.restore('{"nope":1}', fakeDeps().deps)).toThrow('invalid saved game');
  });
});

describe('HostRuntime hardening', () => {
  it.each([
    ['null', null],
    ['empty object', {}],
    ['host-only action', { type: 'trackFailed' }],
    ['string slot', { type: 'place', slot: '1' }],
    ['non-string guess', { type: 'lockIn', guess: { title: 5, artist: 'x' } }],
    ['null guess', { type: 'lockIn', guess: null }],
    ['oversized guess', { type: 'lockIn', guess: { title: 'a'.repeat(1000), artist: 'x' } }],
  ])('rejects a malformed intent (%s) without throwing', (_label, intent) => {
    const { deps, changes } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    expect(rt.handleIntent('p2', intent as never)).toEqual({ ok: false, reason: 'malformed intent' });
    expect(changes).toHaveLength(1);
  });

  it('ignores extra fields on a valid intent', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.handleIntent('p2', { type: 'place', slot: 1, teamId: 'A' } as never)).toEqual({ ok: true });
    expect(rt.state.turn?.teamId).toBe('B');
  });

  it('does nothing after dispose', () => {
    const { deps, pending, changes } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.dispose();
    expect(rt.handleIntent('p2', { type: 'lockIn' })).toEqual({ ok: false, reason: 'disposed' });
    expect(rt.command({ type: 'passTurn' })).toEqual({ ok: false, reason: 'disposed' });
    expect(pending()).toEqual([]);
    expect(changes).toHaveLength(1);
  });
});

/** B (p2) places and locks in: the steal window opens at the current clock time. */
function toStealWindow(rt: HostRuntime) {
  rt.handleIntent('p2', { type: 'place', slot: 1 });
  rt.handleIntent('p2', { type: 'lockIn' });
}

describe('HostRuntime pause', () => {
  it('pauses the steal window and resumes with the time left', () => {
    const { deps, pending, advance } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    toStealWindow(rt);
    advance(2000);
    expect(rt.handleIntent('p3', { type: 'pause' })).toEqual({ ok: true });
    expect(pending()).toEqual([]);
    expect(rt.paused).toEqual({ by: 'p3' });
    expect(rt.viewFor('p1').paused).toEqual({ by: 'p3' });
    expect(rt.viewFor('p1').timerLeftMs).toBe(3000);
    advance(60_000);
    expect(rt.viewFor('p1').timerLeftMs).toBe(3000);
    expect(rt.handleIntent('p1', { type: 'resume' })).toEqual({ ok: true });
    expect(pending()).toEqual([3000]);
    expect(rt.paused).toBeNull();
    expect(rt.viewFor('p1').paused).toBeNull();
  });

  it('reports the running timer to views', () => {
    const { deps, advance } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.viewFor('p1').timerLeftMs).toBeNull();
    toStealWindow(rt);
    advance(1500);
    expect(rt.viewFor('p1').timerLeftMs).toBe(3500);
  });

  it('pauses during the reveal and while deciding', () => {
    const { deps, fire, pending, advance } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.handleIntent('p1', { type: 'pause' })).toEqual({ ok: true });
    expect(rt.viewFor('p1').timerLeftMs).toBeNull();
    expect(rt.handleIntent('p1', { type: 'resume' })).toEqual({ ok: true });
    expect(pending()).toEqual([]);
    toStealWindow(rt);
    fire();
    expect(rt.state.phase).toBe('reveal');
    advance(1000);
    expect(rt.handleIntent('p2', { type: 'pause' })).toEqual({ ok: true });
    expect(pending()).toEqual([]);
    expect(rt.handleIntent('p2', { type: 'resume' })).toEqual({ ok: true });
    expect(pending()).toEqual([4000]);
  });

  it('rejects moves and host commands while paused', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p1', { type: 'pause' });
    expect(rt.handleIntent('p2', { type: 'place', slot: 0 })).toEqual({ ok: false, reason: 'game is paused' });
    expect(rt.handleIntent('p1', { type: 'buy' })).toEqual({ ok: false, reason: 'game is paused' });
    expect(rt.command({ type: 'passTurn' })).toEqual({ ok: false, reason: 'game is paused' });
    expect(rt.command({ type: 'trackFailed' })).toEqual({ ok: false, reason: 'game is paused' });
    expect(rt.handleIntent('p1', { type: 'pause' })).toEqual({ ok: false, reason: 'already paused' });
    expect(rt.state.turn?.slot).toBeNull();
  });

  it('rejects resume when not paused and pause once finished', () => {
    const { deps, fire } = fakeDeps();
    const rt = new HostRuntime(newGame({ cardsToWin: 2 }), PLAYERS, deps);
    expect(rt.handleIntent('p1', { type: 'resume' })).toEqual({ ok: false, reason: 'not paused' });
    toStealWindow(rt);
    fire();
    expect(rt.state.phase).toBe('finished');
    expect(rt.handleIntent('p1', { type: 'pause' })).toEqual({ ok: false, reason: 'nothing to pause' });
  });

  it('a fired-but-cancelled timer does nothing while paused', () => {
    const { deps, timers } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    toStealWindow(rt);
    const stealTimer = timers.at(-1);
    rt.handleIntent('p3', { type: 'pause' });
    stealTimer?.fn();
    expect(rt.state.phase).toBe('stealWindow');
  });

  it('notifies onChange on pause and resume', () => {
    const { deps, changes } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p1', { type: 'pause' });
    expect(changes).toHaveLength(1);
    rt.handleIntent('p1', { type: 'resume' });
    expect(changes).toHaveLength(2);
  });

  it('survives serialize/restore while paused', () => {
    const a = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, a.deps);
    toStealWindow(rt);
    a.advance(2000);
    rt.handleIntent('p3', { type: 'pause' });
    const saved = rt.serialize();
    rt.dispose();
    const b = fakeDeps();
    const restored = HostRuntime.restore(saved, b.deps);
    expect(restored.paused).toEqual({ by: 'p3' });
    expect(b.pending()).toEqual([]);
    expect(restored.viewFor('p1').timerLeftMs).toBe(3000);
    expect(restored.handleIntent('p3', { type: 'resume' })).toEqual({ ok: true });
    expect(b.pending()).toEqual([3000]);
  });

  it('restores v1 saves as not paused', () => {
    const a = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, a.deps);
    toStealWindow(rt);
    const v1 = JSON.stringify({ ...JSON.parse(rt.serialize()), v: 1, paused: undefined });
    const b = fakeDeps();
    const restored = HostRuntime.restore(v1, b.deps);
    expect(restored.paused).toBeNull();
    expect(b.pending()).toEqual([5000]);
  });

  it('rejects unknown players pausing', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.handleIntent('nobody', { type: 'pause' })).toEqual({ ok: false, reason: 'unknown player' });
    expect(rt.paused).toBeNull();
  });
});

describe('HostRuntime steals', () => {
  it('accepts several slots and the legacy single slot', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    expect(rt.handleIntent('p3', { type: 'steal', slots: [0] })).toEqual({ ok: true });
    expect(rt.handleIntent('p1', { type: 'steal', slot: 0 })).toEqual({ ok: false, reason: 'slot taken' });
  });

  it.each([{ slots: 'x' }, { slots: [0], guess: { title: 1 } }, { slots: Array.from({ length: 33 }, (_, i) => i) }, { slots: [0, 'a'] }])(
    'rejects malformed slots %j',
    (extra) => {
      const { deps } = fakeDeps();
      const rt = new HostRuntime(newGame(), PLAYERS, deps);
      rt.handleIntent('p2', { type: 'place', slot: 1 });
      rt.handleIntent('p2', { type: 'lockIn' });
      expect(rt.handleIntent('p3', { type: 'steal', ...extra })).toEqual({ ok: false, reason: 'malformed intent' });
    },
  );

  it('swaps the steal timer for the reveal timer when the window closes early', () => {
    const { deps, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    expect(pending()).toEqual([5000]);
    rt.handleIntent('p3', { type: 'steal', slots: [0] });
    rt.handleIntent('p1', { type: 'steal', slots: [] });
    expect(rt.state.phase).toBe('reveal');
    expect(pending()).toEqual([5000]);
    expect(rt.viewFor('p1').timerLeftMs).toBe(5000);
  });
});

describe('HostRuntime endGame', () => {
  it('is the one command allowed while paused, and clears the pause', () => {
    const { deps, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    rt.handleIntent('p1', { type: 'pause' });
    expect(rt.command({ type: 'endGame' })).toEqual({ ok: true });
    expect(rt.paused).toBeNull();
    expect(rt.state.phase).toBe('finished');
    expect(pending()).toEqual([]);
    expect(JSON.stringify(rt.viewFor('p1'))).not.toContain('Smells Like Teen Spirit');
  });
});

describe('HostRuntime steal answers', () => {
  function stealWindow() {
    const d = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, d.deps);
    rt.handleIntent('p2', { type: 'place', slot: 0 });
    rt.handleIntent('p2', { type: 'lockIn' });
    return { rt, ...d };
  }

  it('checks a stealer name guess with the matcher and pays it at the reveal', () => {
    const { rt } = stealWindow();
    expect(rt.handleIntent('p3', { type: 'steal', slots: [], guess: { title: 'smells like teen spirit', artist: 'nirvana' } })).toEqual({ ok: true });
    expect(rt.handleIntent('p1', { type: 'steal', slots: [], guess: { title: 'nope', artist: 'nobody' } })).toEqual({ ok: true });
    expect(rt.state.phase).toBe('reveal');
    expect(rt.state.lastOutcome?.stealNameBonus).toEqual(['C']);
  });

  it('accepts a pass and shows who answered, never who named it', () => {
    const { rt } = stealWindow();
    expect(rt.handleIntent('p3', { type: 'steal', slots: [], guess: { title: 'smells like teen spirit', artist: 'nirvana' } })).toEqual({ ok: true });
    const view = rt.viewFor('p1');
    expect(view.turn?.answered).toEqual(['C']);
    expect(JSON.stringify(view)).not.toContain('namedBy');
  });
});
