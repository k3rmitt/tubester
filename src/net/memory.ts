import type { GuestToHost, HostToGuest } from './protocol';
import type { GuestStatus, GuestTransport, HostTransport } from './transport';

/** Synchronous in-memory transport for unit tests. Messages are cloned like a real wire. */
export class MemoryHub {
  readonly host = new MemoryHostTransport();
  private next = 1;

  connect(): MemoryGuest {
    const guest = new MemoryGuest(`c${this.next++}`, this.host);
    this.host.attach(guest);
    return guest;
  }
}

export class MemoryHostTransport implements HostTransport {
  audioTrack: MediaStreamTrack | null = null;
  closed = false;
  private readonly guests = new Map<string, MemoryGuest>();
  private msgCb: (connId: string, msg: unknown) => void = () => undefined;
  private discCb: (connId: string) => void = () => undefined;

  attach(guest: MemoryGuest): void {
    this.guests.set(guest.connId, guest);
  }

  deliver(connId: string, msg: unknown): void {
    this.msgCb(connId, structuredClone(msg));
  }

  drop(connId: string): void {
    if (this.guests.delete(connId)) this.discCb(connId);
  }

  onMessage(cb: (connId: string, msg: unknown) => void): void {
    this.msgCb = cb;
  }

  onDisconnect(cb: (connId: string) => void): void {
    this.discCb = cb;
  }

  send(connId: string, msg: HostToGuest): void {
    this.guests.get(connId)?.receive(structuredClone(msg));
  }

  setAudioTrack(track: MediaStreamTrack | null): void {
    this.audioTrack = track;
  }

  close(): void {
    this.closed = true;
  }
}

export class MemoryGuest implements GuestTransport {
  readonly received: HostToGuest[] = [];
  private status: GuestStatus = 'open';
  private statusCb: (s: GuestStatus) => void = () => undefined;
  private msgCb: (m: HostToGuest) => void = () => undefined;

  constructor(
    readonly connId: string,
    private readonly host: MemoryHostTransport,
  ) {}

  onStatus(cb: (s: GuestStatus) => void): void {
    this.statusCb = cb;
    cb(this.status);
  }

  onMessage(cb: (m: HostToGuest) => void): void {
    this.msgCb = cb;
  }

  onAudio(): void {}

  send(msg: GuestToHost): void {
    this.sendRaw(msg);
  }

  sendRaw(msg: unknown): void {
    if (this.status === 'open') this.host.deliver(this.connId, msg);
  }

  receive(msg: HostToGuest): void {
    this.received.push(msg);
    this.msgCb(msg);
  }

  last(): HostToGuest | undefined {
    return this.received.at(-1);
  }

  close(): void {
    this.status = 'closed';
    this.statusCb('closed');
    this.host.drop(this.connId);
  }
}
