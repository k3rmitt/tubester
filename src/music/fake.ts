import { DEMO_TRACKS } from './demo';
import type { MusicSource, PlaybackError, PlaylistSummary, Track } from './types';

export interface ToneOutput {
  start(frequency: number): void;
  stop(): void;
}

export const DEMO_PLAYLIST_ID = 'demo';

/** A stable pitch per track, so players can tell tracks apart in demo mode. */
export function freqFor(trackId: string): number {
  let h = 0;
  for (const ch of trackId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 220 + (h % 440);
}

/** Stand-in for Spotify until Plan 3: plays a test tone per track. */
export class FakeMusicSource implements MusicSource {
  readonly played: string[] = [];
  failNext = false;
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];
  private frequency: number | null = null;

  constructor(
    private readonly tone: ToneOutput,
    private readonly tracks: Track[] = DEMO_TRACKS,
  ) {}

  async listPlaylists(): Promise<PlaylistSummary[]> {
    return [{ id: DEMO_PLAYLIST_ID, name: 'Demo hits', trackCount: this.tracks.length }];
  }

  async loadPlaylist(id: string): Promise<Track[]> {
    if (id !== DEMO_PLAYLIST_ID) throw new Error(`unknown playlist ${id}`);
    return this.tracks.map((t) => ({ ...t, artists: [...t.artists] }));
  }

  async ready(): Promise<void> {}

  async play(trackId: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      for (const cb of this.errorCbs) cb({ trackId, message: 'simulated failure' });
      return;
    }
    this.played.push(trackId);
    this.frequency = freqFor(trackId);
    this.tone.start(this.frequency);
  }

  async stop(): Promise<void> {
    this.frequency = null;
    this.tone.stop();
  }

  async pause(): Promise<void> {
    this.tone.stop();
  }

  async resume(): Promise<void> {
    if (this.frequency !== null) this.tone.start(this.frequency);
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }
}
