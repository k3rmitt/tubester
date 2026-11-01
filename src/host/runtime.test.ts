import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/testkit';
import type { GameState } from '../engine/types';
import { HostRuntime, type RuntimeDeps } from './runtime';

const PLAYERS = { p1: 'A', p2: 'B', p3: 'C' };

function fakeDeps() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const changes: GameState[] = [];
  const deps: RuntimeDeps = {
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
  return { deps, timers, changes, fire, pending };
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
    expect(rt.handleIntent('p3', { type: 'steal', slot: 0 })).toEqual({ ok: true });
    fire();
    expect(rt.state.phase).toBe('reveal');
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
