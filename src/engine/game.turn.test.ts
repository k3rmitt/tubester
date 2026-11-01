import { describe, expect, it } from 'vitest';
import { apply } from './game';
import { newGame, run, teamOf } from './testkit';

describe('place', () => {
  it('records the active team slot', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 });
    expect(g.turn?.slot).toBe(1);
  });
  it('can be changed before locking in', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'place', teamId: 'B', slot: 0 });
    expect(g.turn?.slot).toBe(0);
  });
  it('rejects other teams', () => {
    expect(apply(newGame(), { type: 'place', teamId: 'A', slot: 0 })).toEqual({ ok: false, reason: 'not your turn' });
  });
  it.each([1.5, -1, 2, Number.NaN])('rejects malformed slot %s', (slot) => {
    expect(apply(newGame(), { type: 'place', teamId: 'B', slot })).toEqual({ ok: false, reason: 'invalid slot' });
  });
});

describe('lockIn', () => {
  it('requires a placement', () => {
    expect(apply(newGame(), { type: 'lockIn', teamId: 'B', nameCorrect: false })).toEqual({
      ok: false,
      reason: 'place the card first',
    });
  });
  it('opens the steal window and stores the naming result', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: true });
    expect(g.phase).toBe('stealWindow');
    expect(g.turn?.nameCorrect).toBe(true);
  });
  it('rejects placing after lock-in', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'place', teamId: 'B', slot: 0 })).toEqual({ ok: false, reason: 'not allowed during stealWindow' });
  });
});

describe('skip', () => {
  it('costs one token and plays the next track for the same team', () => {
    const g = run(newGame(), { type: 'skip', teamId: 'B' });
    expect(teamOf(g, 'B').tokens).toBe(1);
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't2', slot: null });
    expect(g.discard).toEqual(['t1']);
  });
  it('is rejected without tokens', () => {
    expect(apply(newGame({ startingTokens: 0 }), { type: 'skip', teamId: 'B' })).toEqual({
      ok: false,
      reason: 'not enough tokens',
    });
  });
  it('ends the game by longest timeline when the deck runs out (ties shared)', () => {
    const g = run(newGame({}, ['a1', 'b1', 'c1', 't1']), { type: 'skip', teamId: 'B' });
    expect(g.phase).toBe('finished');
    expect(g.turn).toBeNull();
    expect(g.winnerIds).toEqual(['A', 'B', 'C']);
  });
});

describe('trackFailed', () => {
  it('replaces the track at no cost', () => {
    const g = run(newGame(), { type: 'trackFailed' });
    expect(teamOf(g, 'B').tokens).toBe(2);
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't2' });
    expect(g.discard).toEqual(['t1']);
  });
  it('only applies while deciding', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'trackFailed' })).toEqual({ ok: false, reason: 'not allowed during stealWindow' });
  });
});

describe('passTurn', () => {
  it('discards the track and moves to the next team', () => {
    const g = run(newGame(), { type: 'passTurn' });
    expect(g.turn).toMatchObject({ teamId: 'C', trackId: 't2' });
    expect(g.turnIndex).toBe(1);
    expect(g.discard).toEqual(['t1']);
  });
});
