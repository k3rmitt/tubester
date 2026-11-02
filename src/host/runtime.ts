import { apply } from '../engine/game';
import type { Action, GameState, TeamId, TrackId } from '../engine/types';
import { matchesGuess, type Guess } from '../match/match';
import { toView, type GameView, type TrackMeta } from './view';

export type GuestIntent =
  | { type: 'place'; slot: number }
  | { type: 'skip' }
  | { type: 'lockIn'; guess?: Guess }
  | { type: 'steal'; slots: number[] }
  | { type: 'buy' }
  | { type: 'pause' }
  | { type: 'resume' };

export type HostCommand = { type: 'trackFailed' } | { type: 'passTurn' } | { type: 'nextTurn' };

export type IntentResult = { ok: true } | { ok: false; reason: string };

export interface RuntimeDeps {
  meta: Record<TrackId, TrackMeta>;
  now: () => number;
  stealWindowMs: number;
  revealMs: number;
  /** Schedules `fn` after `ms`; returns a cancel function. */
  setTimer: (fn: () => void, ms: number) => () => void;
  onChange: (state: GameState) => void;
}

const MAX_GUESS_LENGTH = 200;
const MAX_STEAL_SLOTS = 32;

/** Guests are remote and untrusted: rebuild the intent from known fields only. */
function parseIntent(raw: unknown): GuestIntent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'place':
      return typeof r.slot === 'number' ? { type: 'place', slot: r.slot } : null;
    case 'steal': {
      if (typeof r.slot === 'number') return { type: 'steal', slots: [r.slot] }; // older clients
      const slots = r.slots;
      if (!Array.isArray(slots) || slots.length === 0 || slots.length > MAX_STEAL_SLOTS) return null;
      if (!slots.every((x) => typeof x === 'number')) return null;
      return { type: 'steal', slots: [...slots] };
    }
    case 'skip':
    case 'buy':
    case 'pause':
    case 'resume':
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

interface PauseState {
  by: string;
  /** Time left on the steal or reveal timer when paused; null when none was running. */
  leftMs: number | null;
}

interface Saved {
  v: 2;
  state: GameState;
  players: Record<string, TeamId>;
  paused: PauseState | null;
}

const PAUSABLE = new Set(['deciding', 'stealWindow', 'reveal']);

export class HostRuntime {
  private cancelTimer: (() => void) | null = null;
  private deadline: number | null = null;
  private pause: PauseState | null;
  private disposed = false;

  constructor(
    private current: GameState,
    private readonly players: Record<string, TeamId>,
    private readonly deps: RuntimeDeps,
    paused: PauseState | null = null,
  ) {
    this.pause = paused;
    if (!paused) this.armTimerForPhase();
  }

  get state(): GameState {
    return this.current;
  }

  /** Who paused the game, or null while it runs. */
  get paused(): { by: string } | null {
    return this.pause ? { by: this.pause.by } : null;
  }

  viewFor(playerId: string | null): GameView {
    const teamId = playerId === null ? null : (this.players[playerId] ?? null);
    return { ...toView(this.current, this.deps.meta, teamId), paused: this.paused, timerLeftMs: this.timerLeftMs() };
  }

  handleIntent(playerId: string, raw: unknown): IntentResult {
    const teamId = this.players[playerId];
    if (teamId === undefined) return { ok: false, reason: 'unknown player' };
    const intent = parseIntent(raw);
    if (!intent) return { ok: false, reason: 'malformed intent' };
    if (intent.type === 'pause') return this.doPause(playerId);
    if (intent.type === 'resume') return this.doResume();
    if (this.pause) return { ok: false, reason: 'game is paused' };
    return this.dispatch(this.toAction(teamId, intent));
  }

  command(cmd: HostCommand): IntentResult {
    if (this.pause) return { ok: false, reason: 'game is paused' };
    return this.dispatch(cmd);
  }

  serialize(): string {
    const saved: Saved = { v: 2, state: this.current, players: this.players, paused: this.pause };
    return JSON.stringify(saved);
  }

  static restore(json: string, deps: RuntimeDeps): HostRuntime {
    const saved = JSON.parse(json) as Partial<Omit<Saved, 'v'>> & { v?: number };
    if ((saved.v !== 1 && saved.v !== 2) || !saved.state || !saved.players) throw new Error('invalid saved game');
    const paused = saved.v === 2 && saved.paused ? saved.paused : null;
    return new HostRuntime(saved.state, saved.players, deps, paused);
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private doPause(playerId: string): IntentResult {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (this.pause) return { ok: false, reason: 'already paused' };
    if (!PAUSABLE.has(this.current.phase)) return { ok: false, reason: 'nothing to pause' };
    this.pause = { by: playerId, leftMs: this.timerLeftMs() };
    this.clearTimer();
    this.deps.onChange(this.current);
    return { ok: true };
  }

  private doResume(): IntentResult {
    if (this.disposed) return { ok: false, reason: 'disposed' };
    if (!this.pause) return { ok: false, reason: 'not paused' };
    const left = this.pause.leftMs;
    this.pause = null;
    if (left !== null) this.armTimerForPhase(left);
    this.deps.onChange(this.current);
    return { ok: true };
  }

  private timerLeftMs(): number | null {
    if (this.pause) return this.pause.leftMs;
    return this.deadline === null ? null : Math.max(0, this.deadline - this.deps.now());
  }

  private toAction(teamId: TeamId, intent: Exclude<GuestIntent, { type: 'pause' } | { type: 'resume' }>): Action {
    switch (intent.type) {
      case 'place':
        return { type: 'place', teamId, slot: intent.slot };
      case 'skip':
        return { type: 'skip', teamId };
      case 'steal':
        return { type: 'steal', teamId, slots: intent.slots };
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

  /** Arms the phase's timer for its full length, or for `ms` when resuming. */
  private armTimerForPhase(ms?: number): void {
    this.clearTimer();
    const phase = this.current.phase;
    const action: Action | null =
      phase === 'stealWindow' ? { type: 'closeSteals' } : phase === 'reveal' ? { type: 'nextTurn' } : null;
    if (!action) return;
    const length = ms ?? (phase === 'stealWindow' ? this.deps.stealWindowMs : this.deps.revealMs);
    this.deadline = this.deps.now() + length;
    this.cancelTimer = this.deps.setTimer(() => this.onTimer(action), length);
  }

  private onTimer(action: Action): void {
    if (this.pause) return; // a cancelled timer whose callback still ran
    this.cancelTimer = null;
    this.deadline = null;
    this.dispatch(action); // a rejection here (e.g. game already finished by a buy) is harmless
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.deadline = null;
  }
}
