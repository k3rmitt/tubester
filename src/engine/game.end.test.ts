import { describe, expect, it } from 'vitest';
import { apply } from './game';
import { newGame, run, teamOf } from './testkit';

const revealed = (g = newGame()) =>
  run(g, { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false }, { type: 'closeSteals' });

describe('nextTurn', () => {
  it('moves to the next team with the next track', () => {
    const g = run(revealed(), { type: 'nextTurn' });
    expect(g.phase).toBe('deciding');
    expect(g.turnIndex).toBe(1);
    expect(g.turn).toMatchObject({ teamId: 'C', trackId: 't2', slot: null, steals: [] });
  });
  it('wraps around the turn order', () => {
    let g = revealed();
    g = run(g, { type: 'nextTurn' }, { type: 'passTurn' }, { type: 'passTurn' });
    expect(g.turn?.teamId).toBe('B');
  });
  it('is only allowed after a reveal', () => {
    expect(apply(newGame(), { type: 'nextTurn' })).toEqual({ ok: false, reason: 'not allowed during deciding' });
  });
  it('ends the game by longest timeline when the deck is empty', () => {
    const g = run(revealed(newGame({}, ['a1', 'b1', 'c1', 't1'])), { type: 'nextTurn' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['B']);
  });
});

describe('buy', () => {
  it('spends tokens and inserts the next deck card without touching the current turn', () => {
    const g = run(newGame({ startingTokens: 3 }), { type: 'buy', teamId: 'A' });
    expect(teamOf(g, 'A').tokens).toBe(0);
    expect(teamOf(g, 'A').timeline.map((c) => c.trackId)).toEqual(['t2', 'a1']);
    expect(g.deck[0]).toBe('t3');
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't1' });
  });
  it('works during the steal window', () => {
    const g = run(newGame({ startingTokens: 3 }), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'buy', teamId: 'C' }).ok).toBe(true);
  });
  it('needs enough tokens', () => {
    expect(apply(newGame(), { type: 'buy', teamId: 'A' })).toEqual({ ok: false, reason: 'not enough tokens' });
  });
  it('is not allowed during a reveal', () => {
    expect(apply(revealed(newGame({ startingTokens: 3 })), { type: 'buy', teamId: 'A' })).toEqual({
      ok: false,
      reason: 'cannot buy now',
    });
  });
  it('fails when the deck is empty', () => {
    expect(apply(newGame({ startingTokens: 3 }, ['a1', 'b1', 'c1', 't1']), { type: 'buy', teamId: 'A' })).toEqual({
      ok: false,
      reason: 'deck is empty',
    });
  });
  it('can win the game', () => {
    const g = run(newGame({ startingTokens: 3, cardsToWin: 2 }), { type: 'buy', teamId: 'A' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['A']);
  });
});
