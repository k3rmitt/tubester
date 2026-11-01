import type { Action, GameState, Result, Settings, Team, TeamId, TrackId } from './types';

export interface TeamSetup {
  id: TeamId;
  name: string;
  playerIds: string[];
}

export function createGame(
  settings: Settings,
  teams: TeamSetup[],
  deck: TrackId[],
  years: Record<TrackId, number>,
): GameState {
  if (teams.length < 2) throw new Error('need at least 2 teams');
  for (const id of deck) {
    if (years[id] === undefined) throw new Error(`no year for ${id}`);
  }
  if (deck.length < teams.length + 1) throw new Error('deck too small');

  const remaining = [...deck];
  const built: Team[] = teams.map((t) => {
    const trackId = remaining.shift()!;
    return {
      id: t.id,
      name: t.name,
      playerIds: [...t.playerIds],
      timeline: [{ trackId, year: years[trackId] }],
      tokens: settings.startingTokens,
    };
  });

  const start = built.reduce(
    (best, t, i) => (t.timeline[0].year < built[best].timeline[0].year ? i : best),
    0,
  );
  const turnOrder = [...built.slice(start), ...built.slice(0, start)].map((t) => t.id);

  const state: GameState = {
    settings: { ...settings },
    teams: built,
    years: { ...years },
    deck: remaining,
    discard: [],
    turnOrder,
    turnIndex: 0,
    turn: null,
    phase: 'deciding',
    lastOutcome: null,
    winnerIds: [],
  };
  drawForCurrentTeam(state);
  return state;
}

export function apply(state: GameState, action: Action): Result {
  if (state.phase === 'finished') return { ok: false, reason: 'game is finished' };
  if ('teamId' in action && !state.teams.some((t) => t.id === action.teamId)) {
    return { ok: false, reason: 'unknown team' };
  }
  const s = structuredClone(state);
  const reason = handle(s, action);
  return reason === null ? { ok: true, state: s } : { ok: false, reason };
}

/** Mutates the clone `s`. Returns a rejection reason, or null on success. */
function handle(s: GameState, a: Action): string | null {
  switch (a.type) {
    default:
      return 'unknown action';
  }
}

function activeTeamId(s: GameState): TeamId {
  return s.turnOrder[s.turnIndex % s.turnOrder.length];
}

function team(s: GameState, id: TeamId): Team {
  return s.teams.find((t) => t.id === id)!;
}

function drawForCurrentTeam(s: GameState): void {
  const trackId = s.deck.shift();
  if (trackId === undefined) {
    finishByLongest(s);
    return;
  }
  s.turn = { teamId: activeTeamId(s), trackId, slot: null, nameCorrect: false, steals: [] };
  s.phase = 'deciding';
}

function finishByLongest(s: GameState): void {
  const max = Math.max(...s.teams.map((t) => t.timeline.length));
  s.winnerIds = s.teams.filter((t) => t.timeline.length === max).map((t) => t.id);
  s.turn = null;
  s.phase = 'finished';
}

/** Ends the game if `teamId` reached the target. */
function checkWin(s: GameState, teamId: TeamId): boolean {
  if (team(s, teamId).timeline.length < s.settings.cardsToWin) return false;
  s.winnerIds = [teamId];
  s.phase = 'finished';
  return true;
}
