import { describe, expect, it } from 'vitest';
import { apply } from './game';
import type { GameState } from './types';
import { newGame, run, teamOf } from './testkit';

const lockedAt = (slot: number, nameCorrect = false, g: GameState = newGame()) =>
  run(g, { type: 'place', teamId: 'B', slot }, { type: 'lockIn', teamId: 'B', nameCorrect });

/** B's timeline becomes [1977, 1991]; the current track t1 is 1991 → slots 1 and 2 correct, 0 wrong. */
function withLongerB(): GameState {
  const g = structuredClone(newGame());
  teamOf(g, 'B').timeline = [
    { trackId: 'b1', year: 1977 },
    { trackId: 'x', year: 1991 },
  ];
  return g;
}

describe('reveal without steals', () => {
  it('keeps a correctly placed card', () => {
    const g = run(lockedAt(1), { type: 'closeSteals' });
    expect(g.phase).toBe('reveal');
    expect(teamOf(g, 'B').timeline.map((c) => c.year)).toEqual([1977, 1991]);
    expect(g.lastOutcome).toEqual({ trackId: 't1', activeTeamId: 'B', activeCorrect: true, cardWonBy: 'B', nameBonus: false });
  });
  it('discards a wrongly placed card', () => {
    const g = run(lockedAt(0), { type: 'closeSteals' });
    expect(teamOf(g, 'B').timeline).toHaveLength(1);
    expect(g.discard).toEqual(['t1']);
    expect(g.lastOutcome?.cardWonBy).toBeNull();
  });
});

describe('steal validation', () => {
  it('only works during the steal window', () => {
    expect(apply(newGame(), { type: 'steal', teamId: 'C', slots: [0] })).toEqual({ ok: false, reason: 'no steal window open' });
  });
  it('rejects the active team', () => {
    expect(apply(lockedAt(1), { type: 'steal', teamId: 'B', slots: [0] })).toEqual({ ok: false, reason: 'cannot steal your own card' });
  });
  it("rejects the active team's slot and already-taken slots", () => {
    const g = lockedAt(1);
    expect(apply(g, { type: 'steal', teamId: 'C', slots: [1] })).toEqual({ ok: false, reason: 'slot taken' });
    const g2 = run(withLongerB(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false }, { type: 'steal', teamId: 'C', slots: [0] });
    expect(apply(g2, { type: 'steal', teamId: 'A', slots: [0] })).toEqual({ ok: false, reason: 'slot taken' });
  });
  it('allows one steal per team per turn', () => {
    const g = run(withLongerB(), { type: 'place', teamId: 'B', slot: 0 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    const g2 = run(g, { type: 'steal', teamId: 'C', slots: [1] });
    expect(apply(g2, { type: 'steal', teamId: 'C', slots: [2] })).toEqual({ ok: false, reason: 'already stole this turn' });
  });
  it('needs a token', () => {
    const g = structuredClone(lockedAt(1));
    teamOf(g, 'C').tokens = 0;
    expect(apply(g, { type: 'steal', teamId: 'C', slots: [0] })).toEqual({ ok: false, reason: 'not enough tokens' });
  });
  it.each([1.5, -1, 5])('rejects malformed slot %s', (slot) => {
    expect(apply(lockedAt(1), { type: 'steal', teamId: 'C', slots: [slot] })).toEqual({ ok: false, reason: 'invalid slot' });
  });
  it('spends the token immediately', () => {
    const g = run(lockedAt(1), { type: 'steal', teamId: 'C', slots: [0] });
    expect(teamOf(g, 'C').tokens).toBe(1);
  });
});

describe('reveal with steals', () => {
  it('gives the card to the first correct stealer in arrival order', () => {
    const g = run(
      withLongerB(),
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slots: [2] },
      { type: 'steal', teamId: 'A', slots: [1] },
    );
    expect(g.lastOutcome).toMatchObject({ activeCorrect: false, cardWonBy: 'C' });
    expect(teamOf(g, 'C').timeline.map((c) => c.year)).toEqual([1991, 2003]);
    expect(teamOf(g, 'A').timeline).toHaveLength(1);
    expect(teamOf(g, 'B').timeline).toHaveLength(2);
    expect([teamOf(g, 'A').tokens, teamOf(g, 'C').tokens]).toEqual([1, 1]);
  });
  it('keeps the card with a correct active team even if a stealer chose another correct same-year slot', () => {
    const g = run(
      withLongerB(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slots: [2] },
      { type: 'closeSteals' },
    );
    expect(g.lastOutcome).toMatchObject({ activeCorrect: true, cardWonBy: 'B' });
    expect(teamOf(g, 'C').tokens).toBe(1);
    expect(teamOf(g, 'C').timeline).toHaveLength(1);
  });
  it('discards the card when every steal is wrong too', () => {
    // B's timeline [1977, 1985]; t1 is 1991 → only slot 2 is correct.
    const g0 = structuredClone(newGame());
    teamOf(g0, 'B').timeline = [
      { trackId: 'b1', year: 1977 },
      { trackId: 'y', year: 1985 },
    ];
    const g = run(
      g0,
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slots: [1] },
      { type: 'closeSteals' },
    );
    expect(g.lastOutcome?.cardWonBy).toBeNull();
    expect(g.discard).toEqual(['t1']);
    expect(teamOf(g, 'C').tokens).toBe(1);
  });
});

describe('naming bonus', () => {
  it('earns a token even when the placement is wrong', () => {
    const g = run(lockedAt(0, true), { type: 'closeSteals' });
    expect(teamOf(g, 'B').tokens).toBe(3);
    expect(g.lastOutcome?.nameBonus).toBe(true);
  });
  it('never exceeds the token cap', () => {
    const g = run(lockedAt(1, true, newGame({ startingTokens: 5 })), { type: 'closeSteals' });
    expect(teamOf(g, 'B').tokens).toBe(5);
  });
});

describe('winning', () => {
  it('ends the game when a team reaches the target', () => {
    const g = run(lockedAt(1, false, newGame({ cardsToWin: 2 })), { type: 'closeSteals' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['B']);
    expect(apply(g, { type: 'nextTurn' })).toEqual({ ok: false, reason: 'game is finished' });
  });
});

/** B locked in at slot 0 on [1977, 1991]; t1 is 1991, so slots 1 and 2 are correct. */
const wrongB = () => run(withLongerB(), { type: 'place', teamId: 'B', slot: 0 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });

describe('multi-slot steals', () => {
  it('claims several free slots and charges one token each', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'C', slots: [1, 2] });
    expect(g.turn?.steals).toEqual([
      { teamId: 'C', slot: 1 },
      { teamId: 'C', slot: 2 },
    ]);
    expect(teamOf(g, 'C').tokens).toBe(0);
  });
  it('claims only the free slots and charges only for those', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'A', slots: [2] }, { type: 'steal', teamId: 'C', slots: [1, 2] });
    expect(g.phase).toBe('reveal');
    expect(teamOf(g, 'C').tokens).toBe(1);
  });
  it('rejects more slots than tokens and duplicates', () => {
    const poor = structuredClone(wrongB());
    teamOf(poor, 'C').tokens = 1;
    expect(apply(poor, { type: 'steal', teamId: 'C', slots: [1, 2] })).toEqual({ ok: false, reason: 'not enough tokens' });
    expect(apply(wrongB(), { type: 'steal', teamId: 'C', slots: [3] })).toEqual({ ok: false, reason: 'invalid slot' });
    expect(apply(wrongB(), { type: 'steal', teamId: 'C', slots: [1, 1] })).toEqual({ ok: false, reason: 'invalid slot' });
    expect(apply(wrongB(), { type: 'steal', teamId: 'C', slots: [] })).toEqual({ ok: false, reason: 'invalid slot' });
  });
  it('refuses at no cost when none of the slots are free', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'A', slots: [1] });
    expect(apply(g, { type: 'steal', teamId: 'C', slots: [0, 1] })).toEqual({ ok: false, reason: 'slot taken' });
    expect(teamOf(g, 'C').tokens).toBe(2);
  });
  it('wins with any one of its slots', () => {
    // B's timeline [1977, 1985]; t1 is 1991 → only slot 2 is correct.
    const g0 = structuredClone(newGame());
    teamOf(g0, 'B').timeline = [
      { trackId: 'b1', year: 1977 },
      { trackId: 'y', year: 1985 },
    ];
    const g = run(
      g0,
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slots: [1, 2] },
    );
    expect(g.phase).toBe('reveal');
    expect(g.lastOutcome).toMatchObject({ cardWonBy: 'C' });
  });
});

describe('the steal window closes early', () => {
  it('stays open while a team with tokens has not pressed', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'C', slots: [1] });
    expect(g.phase).toBe('stealWindow');
  });
  it('closes when the last team able to steal presses', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'C', slots: [1] }, { type: 'steal', teamId: 'A', slots: [2] });
    expect(g.phase).toBe('reveal');
  });
  it('does not wait for teams without tokens', () => {
    const g0 = structuredClone(withLongerB());
    teamOf(g0, 'A').tokens = 0;
    const g = run(g0, { type: 'place', teamId: 'B', slot: 0 }, { type: 'lockIn', teamId: 'B', nameCorrect: false }, { type: 'steal', teamId: 'C', slots: [1] });
    expect(g.phase).toBe('reveal');
  });
  it('closes when no free slot is left', () => {
    const g = run(wrongB(), { type: 'steal', teamId: 'C', slots: [1, 2] });
    expect(g.phase).toBe('reveal');
    expect(g.lastOutcome?.cardWonBy).toBe('C');
  });
  it('reveals at lock-in when no other team has a token', () => {
    const g = lockedAt(1, false, newGame({ startingTokens: 0 }));
    expect(g.phase).toBe('reveal');
  });
  it('closes after a buy drops the last waiting team to 0 tokens', () => {
    const g0 = structuredClone(withLongerB());
    teamOf(g0, 'A').tokens = 3;
    const g = run(
      g0,
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slots: [1] },
      { type: 'buy', teamId: 'A' },
    );
    expect(g.phase).toBe('reveal');
  });
});
