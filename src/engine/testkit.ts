import { apply, createGame, type TeamSetup } from './game';
import { DEFAULT_SETTINGS, type Action, type GameState, type Result, type Settings, type Team } from './types';

export const TEAMS: TeamSetup[] = [
  { id: 'A', name: 'Vinyl', playerIds: ['p1'] },
  { id: 'B', name: 'Cassette', playerIds: ['p2'] },
  { id: 'C', name: 'Mixtape', playerIds: ['p3'] },
];

// a1/b1/c1 are dealt as starting cards; t1 is B's first track (B has the oldest card).
export const YEARS: Record<string, number> = {
  a1: 1985, b1: 1977, c1: 2003,
  t1: 1991, t2: 1960, t3: 2000, t4: 1977, t5: 2010, t6: 1995,
};
export const DECK = ['a1', 'b1', 'c1', 't1', 't2', 't3', 't4', 't5', 't6'];

export function newGame(settings: Partial<Settings> = {}, deck: string[] = DECK): GameState {
  return createGame({ ...DEFAULT_SETTINGS, ...settings }, TEAMS, deck, YEARS);
}

export function ok(r: Result): GameState {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.state;
}

export function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => ok(apply(s, a)), state);
}

export function teamOf(state: GameState, id: string): Team {
  const t = state.teams.find((x) => x.id === id);
  if (!t) throw new Error(`no team ${id}`);
  return t;
}
