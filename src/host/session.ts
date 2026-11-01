import { createGame } from '../engine/game';
import { DEFAULT_SETTINGS, type GameState, type TrackId } from '../engine/types';
import type { MusicSource, Track } from '../music/types';
import { type AudioState, type HostToGuest, parseGuestMessage } from '../net/protocol';
import type { HostTransport } from '../net/transport';
import { shuffle } from '../util/shuffle';
import type { KeyValueStorage } from '../util/storage';
import type { SetTimer } from '../util/timer';
import {
  assignTeam,
  canStart,
  createLobby,
  joinLobby,
  type Lobby,
  type LobbySettings,
  playerTeams,
  setConnected,
  teamSetups,
  updateSettings,
} from './lobby';
import { type HostCommand, HostRuntime, type IntentResult, type RuntimeDeps } from './runtime';
import type { GameView, TrackMeta } from './view';

export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 5000;
export const SAVE_KEY = 'tubester.host';
/** After this many failed tracks in a row the host is asked instead of skipping on. */
export const MAX_MUSIC_FAILURES = 3;

/** A track with an optional resolved year (Plan 3 fills `year` from MusicBrainz). */
export type GameTrack = Track & { year?: number };

export interface HostSnapshot {
  lobby: Lobby;
  view: GameView | null;
  audio: AudioState;
  /** Set when playback kept failing; the host must retry. */
  musicError: string | null;
}

export interface HostSessionDeps {
  transport: HostTransport;
  music: MusicSource;
  host: { id: string; name: string };
  setTimer: SetTimer;
  storage: KeyValueStorage;
  random?: () => number;
  onUpdate: (snapshot: HostSnapshot) => void;
}

interface SavedSession {
  v: 1;
  lobby: Lobby;
  secrets: Record<string, string>;
  meta: Record<TrackId, TrackMeta>;
  runtime: string;
}

export class HostSession {
  private lobby: Lobby;
  private secrets: Record<string, string> = {};
  private meta: Record<TrackId, TrackMeta> = {};
  private runtime: HostRuntime | null = null;
  /** connection id → player id */
  private readonly conns = new Map<string, string>();
  private audio: AudioState = 'stopped';
  private playingTrack: TrackId | null = null;
  private cancelCountdown: (() => void) | null = null;
  private musicFailures = 0;
  private musicError: string | null = null;

  constructor(private readonly deps: HostSessionDeps) {
    this.lobby = createLobby(deps.host);
    deps.transport.onMessage((connId, raw) => this.onMessage(connId, raw));
    deps.transport.onDisconnect((connId) => this.onDisconnect(connId));
    deps.music.onError((e) => this.onMusicError(e.trackId, e.message));
    this.restore();
  }

  snapshot(): HostSnapshot {
    return {
      lobby: this.lobby,
      view: this.runtime?.viewFor(this.deps.host.id) ?? null,
      audio: this.audio,
      musicError: this.musicError,
    };
  }

  assignTeam(playerId: string, teamId: string): void {
    this.lobby = assignTeam(this.lobby, playerId, teamId);
    this.broadcast();
  }

  updateSettings(patch: Partial<LobbySettings>): void {
    this.lobby = updateSettings(this.lobby, patch);
    this.broadcast();
  }

  startGame(tracks: GameTrack[]): IntentResult {
    if (this.runtime) return { ok: false, reason: 'game already started' };
    if (!canStart(this.lobby)) return { ok: false, reason: 'need at least 2 teams' };
    const teams = teamSetups(this.lobby);
    if (tracks.length < teams.length + 1) return { ok: false, reason: 'not enough tracks' };

    this.meta = Object.fromEntries(tracks.map((t) => [t.id, { title: t.title, artists: [...t.artists] }]));
    const years = Object.fromEntries(tracks.map((t) => [t.id, t.year ?? t.sourceYear]));
    const deck = shuffle(
      tracks.map((t) => t.id),
      this.deps.random,
    );
    const s = this.lobby.settings;
    const state = createGame(
      { ...DEFAULT_SETTINGS, cardsToWin: s.cardsToWin, startingTokens: s.startingTokens },
      teams,
      deck,
      years,
    );
    this.lobby = { ...this.lobby, started: true };
    this.runtime = new HostRuntime(state, playerTeams(this.lobby), this.runtimeDeps());
    this.onGameChange(state);
    return { ok: true };
  }

  /** The host plays too: its intents go through the same validation as guests'. */
  act(intent: unknown): IntentResult {
    if (!this.runtime) return { ok: false, reason: 'game not started' };
    return this.runtime.handleIntent(this.deps.host.id, intent);
  }

  command(cmd: HostCommand): IntentResult {
    if (!this.runtime) return { ok: false, reason: 'game not started' };
    return this.runtime.command(cmd);
  }

  /** After repeated playback failures: try the current track again. */
  retryMusic(): void {
    if (!this.runtime) return;
    this.musicError = null;
    this.musicFailures = 0;
    this.playingTrack = null;
    this.syncAudio(this.runtime.state);
    this.broadcast();
  }

  /** New game in the same room with the same players. */
  reset(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.stopMusic();
    this.deps.storage.removeItem(SAVE_KEY);
    this.lobby = { ...this.lobby, started: false };
    this.broadcast();
  }

  dispose(): void {
    this.runtime?.dispose();
    this.stopMusic();
  }

  private runtimeDeps(): RuntimeDeps {
    return {
      meta: this.meta,
      stealWindowMs: this.lobby.settings.stealWindowSec * 1000,
      revealMs: REVEAL_MS,
      setTimer: this.deps.setTimer,
      onChange: (state) => this.onGameChange(state),
    };
  }

  private restore(): void {
    const raw = this.deps.storage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedSession;
      if (saved.v !== 1 || !saved.lobby || !saved.secrets || !saved.meta) throw new Error('invalid save');
      this.meta = saved.meta;
      this.secrets = saved.secrets;
      this.lobby = {
        ...saved.lobby,
        players: saved.lobby.players.map((p) => ({ ...p, connected: p.id === this.deps.host.id })),
      };
      this.runtime = HostRuntime.restore(saved.runtime, this.runtimeDeps());
      this.syncAudio(this.runtime.state);
    } catch {
      this.deps.storage.removeItem(SAVE_KEY);
      this.runtime = null;
      this.meta = {};
      this.secrets = {};
      this.lobby = createLobby(this.deps.host);
    }
  }

  private onMessage(connId: string, raw: unknown): void {
    const reason = this.handleMessage(connId, raw);
    if (reason) this.send(connId, { t: 'rejected', reason });
  }

  /** Returns a rejection reason for the sender, or null. */
  private handleMessage(connId: string, raw: unknown): string | null {
    const msg = parseGuestMessage(raw);
    if (!msg) return 'bad message';
    if (msg.t === 'hello') return this.onHello(connId, msg.playerId, msg.secret, msg.name);
    const playerId = this.conns.get(connId);
    if (!playerId) return 'say hello first';
    if (!this.runtime) return 'game not started';
    const res = this.runtime.handleIntent(playerId, msg.intent);
    return res.ok ? null : res.reason;
  }

  private onHello(connId: string, playerId: string, secret: string, name: string): string | null {
    const bound = this.conns.get(connId);
    if (bound !== undefined && bound !== playerId) return 'one player per connection';
    const known = this.secrets[playerId];
    if (playerId === this.deps.host.id || (known !== undefined && known !== secret)) return 'invalid player';
    const res = joinLobby(this.lobby, { id: playerId, name });
    if (!res.ok) return res.reason;
    this.secrets[playerId] = secret;
    for (const [c, p] of this.conns) {
      if (p !== playerId || c === connId) continue;
      this.send(c, { t: 'rejected', reason: 'opened in another tab' });
      this.conns.delete(c);
    }
    this.conns.set(connId, playerId);
    this.lobby = res.lobby;
    this.persist();
    this.broadcast();
    return null;
  }

  private onDisconnect(connId: string): void {
    const playerId = this.conns.get(connId);
    if (!playerId) return;
    this.conns.delete(connId);
    if ([...this.conns.values()].includes(playerId)) return;
    this.lobby = setConnected(this.lobby, playerId, false);
    this.broadcast();
  }

  private onGameChange(state: GameState): void {
    if (state.phase !== 'deciding') this.musicFailures = 0;
    this.syncAudio(state);
    this.persist();
    this.broadcast();
  }

  /** One track per turn: countdown, then play; stop at the reveal. */
  private syncAudio(state: GameState): void {
    const live = state.phase === 'deciding' || state.phase === 'stealWindow';
    const current = live ? (state.turn?.trackId ?? null) : null;
    if (current === this.playingTrack) return;
    this.stopMusic();
    this.playingTrack = current;
    if (current === null) return;
    this.audio = 'countdown';
    this.cancelCountdown = this.deps.setTimer(() => {
      this.cancelCountdown = null;
      if (this.playingTrack !== current) return;
      this.audio = 'playing';
      this.deps.music.play(current).catch((e) => this.onMusicError(current, e instanceof Error ? e.message : String(e)));
      this.broadcast();
    }, COUNTDOWN_MS);
  }

  private stopMusic(): void {
    this.cancelCountdown?.();
    this.cancelCountdown = null;
    this.playingTrack = null;
    this.audio = 'stopped';
    this.deps.music.stop().catch(() => undefined);
  }

  private onMusicError(trackId: TrackId, message: string): void {
    if (!this.runtime || this.playingTrack !== trackId) return;
    this.musicFailures += 1;
    if (this.musicFailures >= MAX_MUSIC_FAILURES) {
      this.musicError = message;
      this.audio = 'stopped';
      this.broadcast();
      return;
    }
    this.runtime.command({ type: 'trackFailed' });
  }

  private persist(): void {
    if (!this.runtime) return;
    const saved: SavedSession = {
      v: 1,
      lobby: this.lobby,
      secrets: this.secrets,
      meta: this.meta,
      runtime: this.runtime.serialize(),
    };
    this.deps.storage.setItem(SAVE_KEY, JSON.stringify(saved));
  }

  private broadcast(): void {
    for (const [connId, playerId] of this.conns) {
      const msg: HostToGuest = this.runtime
        ? {
            t: 'state',
            view: this.runtime.viewFor(playerId),
            lobby: this.lobby,
            audio: this.audio,
            stealWindowMs: this.lobby.settings.stealWindowSec * 1000,
          }
        : { t: 'lobby', lobby: this.lobby };
      this.send(connId, msg);
    }
    this.deps.onUpdate(this.snapshot());
  }

  private send(connId: string, msg: HostToGuest): void {
    this.deps.transport.send(connId, msg);
  }
}
