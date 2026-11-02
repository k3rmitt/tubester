import type { GameState, Outcome, Phase, Settings, Steal, TeamId, TrackId } from '../engine/types';

export interface TrackMeta {
  title: string;
  artists: string[];
  cover?: string;
}

export interface CardView {
  trackId: TrackId;
  year: number;
  title: string;
  artists: string[];
  cover?: string;
}

export interface TeamView {
  id: TeamId;
  name: string;
  playerIds: string[];
  tokens: number;
  timeline: CardView[];
}

export interface TurnView {
  teamId: TeamId;
  slot: number | null;
  steals: Steal[];
  /** Changes whenever a new track comes into play (new turn, skip, failed track). */
  seq: string;
}

export interface RevealView {
  trackId: TrackId;
  title: string;
  artists: string[];
  cover?: string;
  year: number;
  outcome: Outcome;
}

export interface GameView {
  phase: Phase;
  settings: Settings;
  teams: TeamView[];
  turnOrder: TeamId[];
  turn: TurnView | null;
  reveal: RevealView | null;
  deckRemaining: number;
  winnerIds: TeamId[];
  viewerTeamId: TeamId | null;
  /** Set while the game is paused; `by` is the player id who paused. */
  paused: { by: string } | null;
  /** Time left on the steal or reveal timer when this view was built (frozen while paused). */
  timerLeftMs: number | null;
}

const UNKNOWN: TrackMeta = { title: 'Unknown', artists: [] };

/** The only way game state leaves the host. Never includes the current track before the reveal. */
export function toView(state: GameState, meta: Record<TrackId, TrackMeta>, viewerTeamId: TeamId | null): GameView {
  const m = (id: TrackId) => meta[id] ?? UNKNOWN;
  const revealing = state.phase === 'reveal' || (state.phase === 'finished' && state.lastOutcome !== null);
  const o = state.lastOutcome;
  return {
    phase: state.phase,
    settings: { ...state.settings },
    teams: state.teams.map((t) => ({
      id: t.id,
      name: t.name,
      playerIds: [...t.playerIds],
      tokens: t.tokens,
      timeline: t.timeline.map((c) => ({ trackId: c.trackId, year: c.year, ...m(c.trackId) })),
    })),
    turnOrder: [...state.turnOrder],
    turn: state.turn
      ? {
          teamId: state.turn.teamId,
          slot: state.turn.slot,
          steals: state.turn.steals.map((s) => ({ ...s })),
          seq: `${state.turnIndex}-${state.discard.length}`,
        }
      : null,
    reveal:
      revealing && o
        ? { trackId: o.trackId, year: state.years[o.trackId], ...m(o.trackId), outcome: { ...o } }
        : null,
    deckRemaining: state.deck.length,
    winnerIds: [...state.winnerIds],
    viewerTeamId,
    paused: null,
    timerLeftMs: null,
  };
}
