export interface Track {
  id: string;
  title: string;
  artists: string[];
  isrc?: string;
  /** Year reported by the music source (often a remaster/compilation date). */
  sourceYear: number;
  /** Album cover image URL, when the source has one. */
  cover?: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
}

export interface PlaybackError {
  trackId: string;
  message: string;
}

export interface MusicSource {
  listPlaylists(): Promise<PlaylistSummary[]>;
  loadPlaylist(id: string): Promise<Track[]>;
  ready(): Promise<void>;
  play(trackId: string): Promise<void>;
  stop(): Promise<void>;
  onError(cb: (e: PlaybackError) => void): void;
}
