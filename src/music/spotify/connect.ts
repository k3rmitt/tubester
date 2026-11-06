import { HttpError } from '../../util/http';
import type { MusicSource, PlaybackError, PlaylistSummary, Track } from '../types';
import type { SpotifyApi } from './api';

export type ConnectApi = Pick<SpotifyApi, 'listPlaylists' | 'loadPlaylist' | 'play' | 'pause' | 'resume' | 'transfer'>;

export interface ConnectDevice {
  id: string;
  name: string;
}

export const NO_DEVICE = 'Pick a Spotify device to play on';

export function cantReach(name: string): string {
  return `Can't reach ${name}. Open Spotify on it, then try again.`;
}

/** Plays on a Spotify Connect device the host picked (phone app, speaker, TV…), for games in one room. */
export class SpotifyConnectSource implements MusicSource {
  private current: string | null = null;
  private paused = false;
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(
    private readonly api: ConnectApi,
    private readonly device: () => ConnectDevice | null,
  ) {}

  ready(): Promise<void> {
    return Promise.resolve();
  }

  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.api.listPlaylists();
  }

  loadPlaylist(id: string): Promise<Track[]> {
    return this.api.loadPlaylist(id);
  }

  async play(trackId: string): Promise<void> {
    this.current = trackId;
    this.paused = false;
    const device = this.device();
    if (!device) {
      this.emit(trackId, NO_DEVICE);
      return;
    }
    try {
      await this.api.play(device.id, trackId).catch(async (e) => {
        // An idle or asleep device answers 404 "no active device": make it active, then try once more.
        if (!(e instanceof HttpError && e.status === 404) || this.current !== trackId) throw e;
        await this.api.transfer(device.id);
        await this.api.play(device.id, trackId);
      });
      // Paused while the play request was in flight: Spotify started anyway, so pause again.
      if (this.paused && this.current === trackId) await this.api.pause(device.id).catch(() => undefined);
    } catch {
      if (this.current === trackId) this.emit(trackId, cantReach(device.name));
    }
  }

  async stop(): Promise<void> {
    const wasPlaying = this.current !== null;
    this.current = null;
    this.paused = false;
    const device = this.device();
    if (wasPlaying && device) await this.api.pause(device.id).catch(() => undefined);
  }

  async pause(): Promise<void> {
    if (this.current === null) return;
    this.paused = true;
    const device = this.device();
    if (device) await this.api.pause(device.id).catch(() => undefined);
  }

  async resume(): Promise<void> {
    const trackId = this.current;
    const device = this.device();
    if (trackId === null || !device) return;
    this.paused = false;
    await this.api.resume(device.id).catch(() => {
      if (this.current === trackId) this.emit(trackId, cantReach(device.name));
    });
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }

  private emit(trackId: string, message: string): void {
    for (const cb of this.errorCbs) cb({ trackId, message });
  }
}
