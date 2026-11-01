import { describe, expect, it } from 'vitest';
import { apply, createGame } from './game';
import { DEFAULT_SETTINGS } from './types';
import { TEAMS, YEARS, newGame, teamOf } from './testkit';

describe('createGame', () => {
  it('deals one face-up card and the starting tokens to each team', () => {
    const g = newGame();
    expect(teamOf(g, 'A').timeline).toEqual([{ trackId: 'a1', year: 1985 }]);
    expect(teamOf(g, 'B').timeline).toEqual([{ trackId: 'b1', year: 1977 }]);
    expect(teamOf(g, 'C').timeline).toEqual([{ trackId: 'c1', year: 2003 }]);
    expect(g.teams.map((t) => t.tokens)).toEqual([2, 2, 2]);
  });

  it('lets the team with the oldest starting card play first, then rotates', () => {
    const g = newGame();
    expect(g.turnOrder).toEqual(['B', 'C', 'A']);
    expect(g.phase).toBe('deciding');
    expect(g.turn).toEqual({ teamId: 'B', trackId: 't1', slot: null, nameCorrect: false, steals: [] });
    expect(g.deck).toEqual(['t2', 't3', 't4', 't5', 't6']);
  });

  it('fails loudly when a deck track has no year', () => {
    expect(() => createGame(DEFAULT_SETTINGS, TEAMS, ['a1', 'b1', 'c1', 'zz'], YEARS)).toThrow('no year for zz');
  });

  it('requires at least two teams', () => {
    expect(() => createGame(DEFAULT_SETTINGS, [TEAMS[0]], ['a1', 't1'], YEARS)).toThrow('need at least 2 teams');
  });

  it('requires a card per team plus one track to play', () => {
    expect(() => createGame(DEFAULT_SETTINGS, TEAMS, ['a1', 'b1', 'c1'], YEARS)).toThrow('deck too small');
  });
});

describe('apply (skeleton)', () => {
  it('rejects actions from unknown teams without touching state', () => {
    const g = newGame();
    expect(apply(g, { type: 'place', teamId: 'Z', slot: 0 })).toEqual({ ok: false, reason: 'unknown team' });
  });
});
