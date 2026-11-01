import type { MusicSource, PlaybackError, PlaylistSummary, Track } from '../types';
import type { SpotifyApi } from './api';

export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (payload: unknown) => void): boolean;
}

export type SpotifyApiLike = Pick<SpotifyApi, 'listPlaylists' | 'loadPlaylist' | 'play' | 'pause'>;

export const PREMIUM_REQUIRED = 'Spotify Premium is required to host';

const messageOf = (p: unknown, fallback: string) =>
  typeof p === 'object' && p !== null && typeof (p as { message?: unknown }).message === 'string'
    ? (p as { message: string }).message
    : fallback;

/** Plays through the Web Playback SDK device that lives in the host's tab. */
export class SpotifyMusicSource implements MusicSource {
  private player: SdkPlayer | null = null;
  private deviceId: string | null = null;
  private fatal: Error | null = null;
  private current: string | null = null;
  private disposed = false;
  private waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(
    private readonly api: SpotifyApiLike,
    private readonly createPlayer: () => Promise<SdkPlayer>,
  ) {}

  async connect(): Promise<void> {
    const player = await this.createPlayer();
    if (this.disposed) {
      player.disconnect();
      return;
    }
    this.player = player;
    player.addListener('ready', (p) => {
      this.deviceId = (p as { device_id?: string }).device_id ?? null;
      if (this.deviceId) this.settle();
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
    });
    player.addListener('account_error', () => this.fail(new Error(PREMIUM_REQUIRED)));
    player.addListener('authentication_error', (p) => this.fail(new Error(messageOf(p, 'Spotify login expired'))));
    player.addListener('initialization_error', (p) => this.fail(new Error(messageOf(p, 'Spotify player failed to start'))));
    player.addListener('playback_error', (p) => {
      if (this.current) this.emit(this.current, messageOf(p, 'Playback failed'));
    });
    if (!(await player.connect())) throw new Error('Could not connect the Spotify player');
  }

  /** Must run inside a user gesture so the browser lets the SDK play audio. */
  async activate(): Promise<void> {
    await this.player?.activateElement();
  }

  dispose(): void {
    this.disposed = true;
    this.player?.disconnect();
  }

  ready(): Promise<void> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.deviceId) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.api.listPlaylists();
  }

  loadPlaylist(id: string): Promise<Track[]> {
    return this.api.loadPlaylist(id);
  }

  async play(trackId: string): Promise<void> {
    this.current = trackId;
    try {
      await this.ready();
      if (this.current !== trackId || !this.deviceId) return;
      await this.api.play(this.deviceId, trackId);
    } catch (e) {
      if (this.current === trackId) this.emit(trackId, e instanceof Error ? e.message : String(e));
    }
  }

  async stop(): Promise<void> {
    this.current = null;
    if (!this.deviceId) return;
    await this.api.pause(this.deviceId).catch(() => undefined);
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }

  private emit(trackId: string, message: string): void {
    for (const cb of this.errorCbs) cb({ trackId, message });
  }

  private settle(): void {
    for (const w of this.waiters.splice(0)) w.resolve();
  }

  private fail(e: Error): void {
    this.fatal = e;
    for (const w of this.waiters.splice(0)) w.reject(e);
  }
}
