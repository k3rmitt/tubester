import type { Lobby } from '../host/lobby';
import type { GuestIntent } from '../host/runtime';
import type { GameView } from '../host/view';
import type { AudioState, HostToGuest } from '../net/protocol';
import type { GuestStatus, GuestTransport } from '../net/transport';
import type { KeyValueStorage } from '../util/storage';

export const IDENTITY_KEY = 'tubester.identity';

export interface Identity {
  playerId: string;
  secret: string;
}

/** A per-device identity: the public player id plus the secret that proves it on reconnect. */
export function loadIdentity(storage: KeyValueStorage, newId: () => string = () => crypto.randomUUID()): Identity {
  try {
    const raw = storage.getItem(IDENTITY_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Identity>;
      if (typeof v.playerId === 'string' && typeof v.secret === 'string') return { playerId: v.playerId, secret: v.secret };
    }
  } catch {
    // corrupt: replace below
  }
  const identity = { playerId: newId(), secret: newId() };
  storage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export interface GuestSnapshot {
  status: GuestStatus;
  playerId: string;
  lobby: Lobby | null;
  view: GameView | null;
  audio: AudioState;
  stealWindowMs: number;
  stream: MediaStream | null;
  error: string | null;
}

export interface GuestSessionDeps {
  transport: GuestTransport;
  identity: Identity;
  name: string;
  onUpdate: (snapshot: GuestSnapshot) => void;
}

export class GuestSession {
  private snap: GuestSnapshot;

  constructor(private readonly deps: GuestSessionDeps) {
    this.snap = {
      status: 'connecting',
      playerId: deps.identity.playerId,
      lobby: null,
      view: null,
      audio: 'stopped',
      stealWindowMs: 5000,
      stream: null,
      error: null,
    };
    const t = deps.transport;
    t.onMessage((m) => this.onMessage(m));
    t.onAudio((stream) => this.update({ stream }));
    t.onStatus((status) => {
      this.update({ status });
      if (status === 'open') {
        t.send({ t: 'hello', playerId: deps.identity.playerId, secret: deps.identity.secret, name: deps.name });
      }
    });
  }

  get snapshot(): GuestSnapshot {
    return this.snap;
  }

  act(intent: GuestIntent): void {
    this.update({ error: null });
    this.deps.transport.send({ t: 'intent', intent });
  }

  dispose(): void {
    this.deps.transport.close();
  }

  private onMessage(m: HostToGuest): void {
    switch (m.t) {
      case 'lobby':
        this.update({ lobby: m.lobby, view: null });
        return;
      case 'state':
        this.update({ lobby: m.lobby, view: m.view, audio: m.audio, stealWindowMs: m.stealWindowMs });
        return;
      case 'rejected':
        this.update({ error: m.reason });
        return;
    }
  }

  private update(patch: Partial<GuestSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.deps.onUpdate(this.snap);
  }
}
