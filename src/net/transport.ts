import type { GuestToHost, HostToGuest } from './protocol';

export interface HostTransport {
  onMessage(cb: (connId: string, msg: unknown) => void): void;
  onDisconnect(cb: (connId: string) => void): void;
  send(connId: string, msg: HostToGuest): void;
  /** Streams this track to every current and future guest. */
  setAudioTrack(track: MediaStreamTrack | null): void;
  close(): void;
}

export type GuestStatus = 'connecting' | 'open' | 'closed';

export interface GuestTransport {
  /** Calls `cb` right away with the current status, then on every change. */
  onStatus(cb: (status: GuestStatus) => void): void;
  onMessage(cb: (msg: HostToGuest) => void): void;
  onAudio(cb: (stream: MediaStream) => void): void;
  send(msg: GuestToHost): void;
  close(): void;
}
