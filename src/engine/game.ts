import { insertCard, isCorrectSlot, isValidSlot } from './timeline';
import type { Action, GameState, Phase, Result, Settings, Team, TeamId, TrackId } from './types';

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
    case 'place':
      return place(s, a.teamId, a.slot);
    case 'lockIn':
      return lockIn(s, a.teamId, a.nameCorrect);
    case 'skip':
      return skip(s, a.teamId);
    case 'trackFailed':
      return trackFailed(s);
    case 'passTurn':
      return passTurn(s);
    case 'steal':
      return steal(s, a.teamId, a.slot);
    case 'closeSteals':
      return closeSteals(s);
    case 'nextTurn':
      return nextTurn(s);
    case 'buy':
      return buy(s, a.teamId);
    default: {
      const never: never = a;
      return `unknown action ${(never as { type: string }).type}`;
    }
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

function requirePhase(s: GameState, phase: Phase): string | null {
  if (s.phase !== phase) return `not allowed during ${s.phase}`;
  if (!s.turn) return 'no track playing';
  return null;
}

function requireActive(s: GameState, teamId: TeamId, phase: Phase): string | null {
  const err = requirePhase(s, phase);
  if (err) return err;
  if (s.turn!.teamId !== teamId) return 'not your turn';
  return null;
}

function place(s: GameState, teamId: TeamId, slot: number): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  if (!isValidSlot(team(s, teamId).timeline, slot)) return 'invalid slot';
  s.turn!.slot = slot;
  return null;
}

function lockIn(s: GameState, teamId: TeamId, nameCorrect: boolean): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  if (s.turn!.slot === null) return 'place the card first';
  s.turn!.nameCorrect = nameCorrect;
  s.phase = 'stealWindow';
  return null;
}

function skip(s: GameState, teamId: TeamId): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  const t = team(s, teamId);
  if (t.tokens < 1) return 'not enough tokens';
  t.tokens -= 1;
  s.discard.push(s.turn!.trackId);
  drawForCurrentTeam(s);
  return null;
}

function trackFailed(s: GameState): string | null {
  const err = requirePhase(s, 'deciding');
  if (err) return err;
  s.discard.push(s.turn!.trackId);
  drawForCurrentTeam(s);
  return null;
}

function passTurn(s: GameState): string | null {
  const err = requirePhase(s, 'deciding');
  if (err) return err;
  s.discard.push(s.turn!.trackId);
  s.turnIndex += 1;
  drawForCurrentTeam(s);
  return null;
}

function steal(s: GameState, teamId: TeamId, slot: number): string | null {
  if (s.phase !== 'stealWindow' || !s.turn) return 'no steal window open';
  const turn = s.turn;
  if (teamId === turn.teamId) return 'cannot steal your own card';
  const thief = team(s, teamId);
  if (turn.steals.some((x) => x.teamId === teamId)) return 'already stole this turn';
  if (thief.tokens < 1) return 'not enough tokens';
  if (!isValidSlot(team(s, turn.teamId).timeline, slot)) return 'invalid slot';
  if (slot === turn.slot || turn.steals.some((x) => x.slot === slot)) return 'slot taken';
  thief.tokens -= 1;
  turn.steals.push({ teamId, slot });
  return null;
}

function closeSteals(s: GameState): string | null {
  if (s.phase !== 'stealWindow' || !s.turn) return 'no steal window open';
  const { trackId, teamId, slot, nameCorrect, steals } = s.turn;
  const year = s.years[trackId];
  const active = team(s, teamId);

  const activeCorrect = isCorrectSlot(active.timeline, slot!, year);
  let cardWonBy: TeamId | null = activeCorrect ? teamId : null;
  if (!activeCorrect) {
    const winner = steals.find((x) => isCorrectSlot(active.timeline, x.slot, year));
    cardWonBy = winner ? winner.teamId : null;
  }

  if (cardWonBy) {
    const w = team(s, cardWonBy);
    w.timeline = insertCard(w.timeline, { trackId, year });
  } else {
    s.discard.push(trackId);
  }
  if (nameCorrect) active.tokens = Math.min(s.settings.tokenCap, active.tokens + 1);

  s.lastOutcome = { trackId, activeTeamId: teamId, activeCorrect, cardWonBy, nameBonus: nameCorrect };
  s.phase = 'reveal';
  if (cardWonBy) checkWin(s, cardWonBy);
  return null;
}

function nextTurn(s: GameState): string | null {
  if (s.phase !== 'reveal') return `not allowed during ${s.phase}`;
  s.turnIndex += 1;
  drawForCurrentTeam(s);
  return null;
}

function buy(s: GameState, teamId: TeamId): string | null {
  if (s.phase !== 'deciding' && s.phase !== 'stealWindow') return 'cannot buy now';
  // The active team's stored slot indices would shift if its timeline changed mid-turn.
  if (s.turn?.teamId === teamId) return 'cannot buy during your own turn';
  const t = team(s, teamId);
  if (t.tokens < s.settings.buyCost) return 'not enough tokens';
  const trackId = s.deck.shift();
  if (trackId === undefined) return 'deck is empty';
  t.tokens -= s.settings.buyCost;
  t.timeline = insertCard(t.timeline, { trackId, year: s.years[trackId] });
  checkWin(s, teamId);
  return null;
}
