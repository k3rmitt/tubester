import { describe, expect, it } from 'vitest';
import { newGame, run, teamOf } from '../engine/testkit';
import type { GameState } from '../engine/types';
import { toView } from '../host/view';
import { connectionHeadline, revealHeadline, slotLabel, winnersHeadline } from './text';

const reveal = (g: GameState, viewer: string | null) => toView(g, {}, viewer);
const lockAndClose = (g: GameState, slot: number, steals: { teamId: string; slot: number }[] = []) =>
  run(
    g,
    { type: 'place', teamId: 'B', slot },
    { type: 'lockIn', teamId: 'B', nameCorrect: false },
    ...steals.map((s) => ({ type: 'steal' as const, ...s })),
    { type: 'closeSteals' },
  );

describe('slotLabel', () => {
  const cards = [{ year: 1977 }, { year: 1985 }];
  it.each([
    [0, 'Before 1977'],
    [1, 'Between 1977 and 1985'],
    [2, 'After 1985'],
  ])('slot %i → %s', (slot, label) => {
    expect(slotLabel(cards, slot)).toBe(label);
  });
});

describe('revealHeadline', () => {
  it('speaks to the team that kept the card', () => {
    const g = lockAndClose(newGame(), 1);
    expect(revealHeadline(reveal(g, 'B'))).toBe('You got it!');
    expect(revealHeadline(reveal(g, 'C'))).toBe('Cassette got it');
  });
  it('announces steals and misses', () => {
    const g0 = structuredClone(newGame());
    teamOf(g0, 'B').timeline = [
      { trackId: 'b1', year: 1977 },
      { trackId: 'x', year: 1991 },
    ];
    const stolen = lockAndClose(g0, 0, [{ teamId: 'C', slot: 2 }]);
    expect(revealHeadline(reveal(stolen, 'C'))).toBe('You stole it!');
    expect(revealHeadline(reveal(stolen, 'A'))).toBe('Mixtape stole it');
    expect(revealHeadline(reveal(lockAndClose(newGame(), 0), 'A'))).toBe('Nobody got it');
  });
});

describe('winnersHeadline', () => {
  it('congratulates the winner and tells the others', () => {
    const g = lockAndClose(newGame({ cardsToWin: 2 }), 1);
    expect(winnersHeadline(reveal(g, 'B'))).toBe('You win!');
    expect(winnersHeadline(reveal(g, 'A'))).toBe('Cassette wins!');
    expect(winnersHeadline(reveal(newGame(), 'A'))).toBe('');
  });
});

describe('connectionHeadline', () => {
  it.each([
    ['connecting', false, null, 'Connecting…'],
    ['open', false, null, 'Connecting…'],
    ['open', true, null, "You're in!"],
    ['open', false, 'game in progress', "Couldn't join"],
    ['closed', true, null, 'Connection lost'],
    ['closed', false, 'room full', 'Connection lost'],
  ] as const)('%s, joined=%s, error=%s → %s', (status, joined, error, headline) => {
    expect(connectionHeadline(status, joined, error)).toBe(headline);
  });
});
