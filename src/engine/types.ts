export type TrackId = string;
export type TeamId = string;

export interface Card {
  trackId: TrackId;
  year: number;
}

export interface Team {
  id: TeamId;
  name: string;
  playerIds: string[];
  /** Sorted oldest → newest. */
  timeline: Card[];
  tokens: number;
}

export interface Settings {
  cardsToWin: number;
  startingTokens: number;
  tokenCap: number;
  buyCost: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cardsToWin: 10,
  startingTokens: 2,
  tokenCap: 5,
  buyCost: 3,
};

export type Phase = 'deciding' | 'stealWindow' | 'reveal' | 'finished';

export interface Steal {
  teamId: TeamId;
  slot: number;
}

export interface Turn {
  teamId: TeamId;
  trackId: TrackId;
  slot: number | null;
  nameCorrect: boolean;
  /** In arrival order at the host. */
  steals: Steal[];
  /** Teams that answered the steal window (slots, a name or a pass), in arrival order. */
  answered: TeamId[];
  /** Stealing teams whose name guess was right; secret until the reveal. */
  namedBy: TeamId[];
}

export interface Outcome {
  trackId: TrackId;
  activeTeamId: TeamId;
  activeCorrect: boolean;
  cardWonBy: TeamId | null;
  nameBonus: boolean;
  /** Stealing teams that named the song (only when the active team did not). */
  stealNameBonus: TeamId[];
}

export interface GameState {
  settings: Settings;
  teams: Team[];
  years: Record<TrackId, number>;
  /** Next track to play is deck[0]. */
  deck: TrackId[];
  discard: TrackId[];
  turnOrder: TeamId[];
  turnIndex: number;
  turn: Turn | null;
  phase: Phase;
  lastOutcome: Outcome | null;
  winnerIds: TeamId[];
}

export type Action =
  | { type: 'place'; teamId: TeamId; slot: number }
  | { type: 'skip'; teamId: TeamId }
  | { type: 'lockIn'; teamId: TeamId; nameCorrect: boolean }
  | { type: 'trackFailed' }
  | { type: 'passTurn' }
  | { type: 'steal'; teamId: TeamId; slots: number[]; nameCorrect?: boolean }
  | { type: 'closeSteals' }
  | { type: 'nextTurn' }
  | { type: 'buy'; teamId: TeamId }
  | { type: 'endGame' };

export type Result = { ok: true; state: GameState } | { ok: false; reason: string };
