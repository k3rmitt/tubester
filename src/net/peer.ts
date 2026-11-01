import Peer, { type DataConnection, type MediaConnection, type PeerOptions } from 'peerjs';
import type { GuestToHost, HostToGuest } from './protocol';
import { peerIdFor } from './room';
import type { GuestStatus, GuestTransport, HostTransport } from './transport';

const RETRY_MS = 2000;
const GIVE_UP_MS = 120_000;
const RETRYABLE = new Set(['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed']);

function peerOptions(): PeerOptions {
  const env = import.meta.env;
  if (!env.VITE_PEER_HOST) return {};
  return {
    host: env.VITE_PEER_HOST,
    port: Number(env.VITE_PEER_PORT ?? 443),
    path: env.VITE_PEER_PATH ?? '/',
    secure: env.VITE_PEER_SECURE !== 'false',
  };
}

export function createHostTransport(code: string, attempts = 15): Promise<HostTransport> {
  return new Promise((resolve, reject) => {
    const tryOpen = (left: number) => {
      const peer = new Peer(peerIdFor(code), peerOptions());
      let opened = false;
      peer.on('open', () => {
        opened = true;
        resolve(new PeerHostTransport(peer));
      });
      peer.on('error', (err) => {
        if (opened) return;
        peer.destroy();
        if (RETRYABLE.has(err.type) && left > 0) setTimeout(() => tryOpen(left - 1), RETRY_MS);
        else reject(err);
      });
    };
    tryOpen(attempts);
  });
}

class PeerHostTransport implements HostTransport {
  private readonly conns = new Map<string, DataConnection>();
  private readonly calls = new Map<string, MediaConnection>();
  private track: MediaStreamTrack | null = null;
  private msgCb: (connId: string, msg: unknown) => void = () => undefined;
  private discCb: (connId: string) => void = () => undefined;

  constructor(private readonly peer: Peer) {
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.connectionId, conn);
        this.callGuest(conn);
      });
      conn.on('data', (data) => this.msgCb(conn.connectionId, data));
      conn.on('close', () => this.drop(conn.connectionId));
      conn.on('error', () => this.drop(conn.connectionId));
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
  }

  onMessage(cb: (connId: string, msg: unknown) => void): void {
    this.msgCb = cb;
  }

  onDisconnect(cb: (connId: string) => void): void {
    this.discCb = cb;
  }

  send(connId: string, msg: HostToGuest): void {
    const conn = this.conns.get(connId);
    if (conn?.open) void conn.send(msg);
  }

  setAudioTrack(track: MediaStreamTrack | null): void {
    this.track = track;
    for (const call of this.calls.values()) call.close();
    this.calls.clear();
    for (const conn of this.conns.values()) this.callGuest(conn);
  }

  close(): void {
    this.peer.destroy();
  }

  private callGuest(conn: DataConnection): void {
    if (!this.track) return;
    this.calls.set(conn.connectionId, this.peer.call(conn.peer, new MediaStream([this.track])));
  }

  private drop(connId: string): void {
    if (!this.conns.delete(connId)) return;
    this.calls.get(connId)?.close();
    this.calls.delete(connId);
    this.discCb(connId);
  }
}

export function createGuestTransport(code: string): GuestTransport {
  return new PeerGuestTransport(peerIdFor(code));
}

class PeerGuestTransport implements GuestTransport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private status: GuestStatus = 'connecting';
  private stopped = false;
  private failingSince: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private statusCb: (s: GuestStatus) => void = () => undefined;
  private msgCb: (m: HostToGuest) => void = () => undefined;
  private audioCb: (s: MediaStream) => void = () => undefined;

  constructor(private readonly hostId: string) {
    this.start();
  }

  onStatus(cb: (s: GuestStatus) => void): void {
    this.statusCb = cb;
    cb(this.status);
  }

  onMessage(cb: (m: HostToGuest) => void): void {
    this.msgCb = cb;
  }

  onAudio(cb: (s: MediaStream) => void): void {
    this.audioCb = cb;
  }

  send(msg: GuestToHost): void {
    if (this.conn?.open) void this.conn.send(msg);
  }

  close(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.peer?.destroy();
    this.setStatus('closed');
  }

  private setStatus(s: GuestStatus): void {
    this.status = s;
    this.statusCb(s);
  }

  private start(): void {
    const peer = new Peer(peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(this.hostId, { reliable: true, serialization: 'json' });
      this.conn = conn;
      conn.on('open', () => {
        if (this.peer !== peer) return;
        this.failingSince = null;
        this.setStatus('open');
      });
      conn.on('data', (data) => this.msgCb(data as HostToGuest));
      conn.on('close', () => this.retry(peer));
      conn.on('error', () => this.retry(peer));
    });
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (stream) => this.audioCb(stream));
    });
    peer.on('error', () => this.retry(peer));
  }

  private retry(from: Peer): void {
    if (this.stopped || this.peer !== from || this.retryTimer !== null) return;
    this.failingSince ??= Date.now();
    const giveUp = Date.now() - this.failingSince > GIVE_UP_MS;
    if (giveUp) {
      this.stopped = true;
    } else {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.start();
      }, RETRY_MS);
    }
    this.peer = null;
    this.conn = null;
    from.destroy();
    this.setStatus(giveUp ? 'closed' : 'connecting');
  }
}
