import { describe, expect, it } from 'vitest';
import { newGame, run } from '../engine/testkit';
import { toView, type TrackMeta } from './view';

const meta: Record<string, TrackMeta> = {
  a1: { title: 'Take On Me', artists: ['a-ha'] },
  b1: { title: 'Go Your Own Way', artists: ['Fleetwood Mac'] },
  c1: { title: 'Crazy in Love', artists: ['Beyoncé'] },
  t1: { title: 'Secret Song Title', artists: ['Hidden Artist'] },
  t2: { title: 'Two', artists: ['x'] },
};

describe('toView', () => {
  it('shows revealed timeline cards with their metadata', () => {
    const v = toView(newGame(), meta, 'A');
    expect(v.teams[0].timeline).toEqual([{ trackId: 'a1', year: 1985, title: 'Take On Me', artists: ['a-ha'] }]);
    expect(v.viewerTeamId).toBe('A');
    expect(v.deckRemaining).toBe(5);
  });

  it.each(['deciding', 'stealWindow'] as const)('never leaks the current track during %s', (phase) => {
    let g = newGame();
    if (phase === 'stealWindow') {
      g = run(g, { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    }
    const json = JSON.stringify(toView(g, meta, 'B'));
    expect(json).not.toContain('t1');
    expect(json).not.toContain('Secret Song Title');
    expect(json).not.toContain('Hidden Artist');
    expect(json).not.toContain('1991');
    expect(toView(g, meta, 'B').reveal).toBeNull();
  });

  it('exposes the turn without the track', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 });
    expect(toView(g, meta, null).turn).toEqual({ teamId: 'B', slot: 1, steals: [], seq: '0-0' });
  });

  it('changes the turn seq when a new track comes into play', () => {
    const g0 = newGame();
    const g1 = run(g0, { type: 'skip', teamId: 'B' });
    expect(toView(g0, meta, null).turn?.seq).not.toBe(toView(g1, meta, null).turn?.seq);
  });

  it('reveals title, artists, year and outcome after closeSteals', () => {
    const g = run(
      newGame(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
    );
    expect(toView(g, meta, 'C').reveal).toEqual({
      trackId: 't1',
      title: 'Secret Song Title',
      artists: ['Hidden Artist'],
      year: 1991,
      outcome: { trackId: 't1', activeTeamId: 'B', activeCorrect: true, cardWonBy: 'B', nameBonus: false },
    });
  });

  it('does not show the previous reveal once the next turn starts', () => {
    const g = run(
      newGame(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
      { type: 'nextTurn' },
    );
    expect(toView(g, meta, 'C').reveal).toBeNull();
  });

  it('keeps the final reveal visible when the game finishes on a reveal', () => {
    const g = run(
      newGame({ cardsToWin: 2 }),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
    );
    const v = toView(g, meta, 'B');
    expect(v.phase).toBe('finished');
    expect(v.reveal?.year).toBe(1991);
    expect(v.winnerIds).toEqual(['B']);
  });
});
