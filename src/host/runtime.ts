import { apply } from '../engine/game';
import type { Action, GameState, TeamId, TrackId } from '../engine/types';
import { matchesGuess, type Guess } from '../match/match';
import { toView, type GameView, type TrackMeta } from './view';

export type GuestIntent =
  | { type: 'place'; slot: number }
  | { type: 'skip' }
  | { type: 'lockIn'; guess?: Guess }
  | { type: 'steal'; slot: number }
  | { type: 'buy' };

export type HostCommand = { type: 'trackFailed' } | { type: 'passTurn' } | { type: 'nextTurn' };

export type IntentResult = { ok: true } | { ok: false; reason: string };

export interface RuntimeDeps {
  meta: Record<TrackId, TrackMeta>;
  stealWindowMs: number;
  revealMs: number;
  /** Schedules `fn` after `ms`; returns a cancel function. */
  setTimer: (fn: () => void, ms: number) => () => void;
  onChange: (state: GameState) => void;
}

const MAX_GUESS_LENGTH = 200;

/** Guests are remote and untrusted: rebuild the intent from known fields only. */
function parseIntent(raw: unknown): GuestIntent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'place':
    case 'steal':
      return typeof r.slot === 'number' ? { type: r.type, slot: r.slot } : null;
    case 'skip':
    case 'buy':
      return { type: r.type };
    case 'lockIn': {
      if (r.guess === undefined) return { type: 'lockIn' };
      const g = r.guess as Record<string, unknown> | null;
      if (typeof g !== 'object' || g === null) return null;
      const { title, artist } = g;
      if (typeof title !== 'string' || typeof artist !== 'string') return null;
      if (title.length > MAX_GUESS_LENGTH || artist.length > MAX_GUESS_LENGTH) return null;
      return { type: 'lockIn', guess: { title, artist } };
    }
    default:
      return null;
  }
}

interface Saved {
  v: 1;
  state: GameState;
  players: Record<string, TeamId>;
}

export class HostRuntime {
  private cancelTimer: (() => void) | null = null;
  private disposed = false;

  constructor(
    private current: GameState,
    private readonly players: Record<string, TeamId>,
    private readonly deps: RuntimeDeps,
  ) {
    this.armTimerForPhase();
  }

  get state(): GameState {
    return this.current;
  }

  viewFor(playerId: string | null): GameView {
    const teamId = playerId === null ? null : (this.players[playerId] ?? null);
    return toView(this.current, this.deps.meta, teamId);
  }

  handleIntent(playerId: string, raw: unknown): IntentResult {
    const teamId = this.players[playerId];
    if (teamId === undefined) return { ok: false, reason: 'unknown player' };
    const intent = parseIntent(raw);
    if (!intent) return { ok: false, reason: 'malformed intent' };
    return this.dispatch(this.toAction(teamId, intent));
  }

  command(cmd: HostCommand): IntentResult {
    return this.dispatch(cmd);
  }

  serialize(): string {
    const saved: Saved = { v: 1, state: this.current, players: this.players };
    return JSON.stringify(saved);
  }

  static restore(json: string, deps: RuntimeDeps): HostRuntime {
    const saved = JSON.parse(json) as Partial<Saved>;
    if (saved.v !== 1 || !saved.state || !saved.players) throw new Error('invalid saved game');
    return new HostRuntime(saved.state, saved.players, deps);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private toAction(teamId: TeamId, intent: GuestIntent): Action {
    switch (intent.type) {
      case 'place':
        return { type: 'place', teamId, slot: intent.slot };
      case 'skip':
        return { type: 'skip', teamId };
      case 'steal':
        return { type: 'steal', teamId, slot: intent.slot };
      case 'buy':
        return { type: 'buy', teamId };
      case 'lockIn':
        return { type: 'lockIn', teamId, nameCorrect: this.isNameCorrect(intent.guess) };
    }
  }

  private isNameCorrect(guess: Guess | undefined): boolean {
    const turn = this.current.turn;
    if (!guess || !turn) return false;
    const meta = this.deps.meta[turn.trackId];
    return meta ? matchesGuess(guess, meta) : false;
  }

  private dispatch(action: Action): IntentResult {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    const before = this.current.phase;
    const result = apply(this.current, action);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.current = result.state;
    if (this.current.phase !== before) this.armTimerForPhase();
    this.deps.onChange(this.current);
    return { ok: true };
  }

  private armTimerForPhase(): void {
    this.clearTimer();
    const phase = this.current.phase;
    if (phase === 'stealWindow') {
      this.cancelTimer = this.deps.setTimer(() => this.onTimer({ type: 'closeSteals' }), this.deps.stealWindowMs);
    } else if (phase === 'reveal') {
      this.cancelTimer = this.deps.setTimer(() => this.onTimer({ type: 'nextTurn' }), this.deps.revealMs);
    }
  }

  private onTimer(action: Action): void {
    this.cancelTimer = null;
    this.dispatch(action); // a rejection here (e.g. game already finished by a buy) is harmless
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
