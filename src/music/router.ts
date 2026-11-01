import type { MusicSource, PlaybackError, PlaylistSummary, Track } from './types';

/** Lets the host switch between demo tones and Spotify without rebuilding the session. */
export class MusicRouter implements MusicSource {
  private current: MusicSource;
  private readonly wired = new Set<MusicSource>();
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(initial: MusicSource) {
    this.current = initial;
    this.wire(initial);
  }

  use(source: MusicSource): void {
    if (source === this.current) return;
    this.current.stop().catch(() => undefined);
    this.current = source;
    this.wire(source);
  }

  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.current.listPlaylists();
  }

  loadPlaylist(id: string): Promise<Track[]> {
    return this.current.loadPlaylist(id);
  }

  ready(): Promise<void> {
    return this.current.ready();
  }

  play(trackId: string): Promise<void> {
    return this.current.play(trackId);
  }

  stop(): Promise<void> {
    return this.current.stop();
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }

  private wire(source: MusicSource): void {
    if (this.wired.has(source)) return;
    this.wired.add(source);
    source.onError((e) => {
      if (source === this.current) for (const cb of this.errorCbs) cb(e);
    });
  }
}
