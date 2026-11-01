import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/testkit';
import { createLobby } from '../host/lobby';
import { toView } from '../host/view';
import type { GuestToHost, HostToGuest } from '../net/protocol';
import type { GuestStatus, GuestTransport } from '../net/transport';
import { memoryStorage } from '../util/storage';
import { GuestSession, type GuestSnapshot, IDENTITY_KEY, loadIdentity } from './session';

function stub() {
  let statusCb: (s: GuestStatus) => void = () => undefined;
  let msgCb: (m: HostToGuest) => void = () => undefined;
  let audioCb: (s: MediaStream) => void = () => undefined;
  const sent: GuestToHost[] = [];
  let closed = false;
  const transport: GuestTransport = {
    onStatus: (cb) => {
      statusCb = cb;
      cb('connecting');
    },
    onMessage: (cb) => {
      msgCb = cb;
    },
    onAudio: (cb) => {
      audioCb = cb;
    },
    send: (m) => sent.push(m),
    close: () => {
      closed = true;
    },
  };
  return {
    transport,
    sent,
    isClosed: () => closed,
    status: (s: GuestStatus) => statusCb(s),
    deliver: (m: HostToGuest) => msgCb(m),
    audio: (s: MediaStream) => audioCb(s),
  };
}

function setup() {
  const t = stub();
  const snaps: GuestSnapshot[] = [];
  const session = new GuestSession({
    transport: t.transport,
    identity: { playerId: 'p1', secret: 's1' },
    name: 'Léa',
    onUpdate: (s) => snaps.push(s),
  });
  return { t, snaps, session };
}

describe('GuestSession', () => {
  it('says hello every time the connection opens', () => {
    const { t, session } = setup();
    expect(t.sent).toEqual([]);
    t.status('open');
    t.status('connecting');
    t.status('open');
    expect(t.sent).toEqual([
      { t: 'hello', playerId: 'p1', secret: 's1', name: 'Léa' },
      { t: 'hello', playerId: 'p1', secret: 's1', name: 'Léa' },
    ]);
    expect(session.snapshot.status).toBe('open');
  });

  it('tracks lobby, state, rejections and audio', () => {
    const { t, session } = setup();
    const lobby = createLobby({ id: 'host', name: 'Hervé' });
    t.deliver({ t: 'lobby', lobby });
    expect(session.snapshot.lobby).toEqual(lobby);
    const view = toView(newGame(), {}, 'B');
    t.deliver({ t: 'state', view, lobby, audio: 'playing', stealWindowMs: 3000 });
    expect(session.snapshot).toMatchObject({ view, audio: 'playing', stealWindowMs: 3000 });
    t.deliver({ t: 'rejected', reason: 'not your turn' });
    expect(session.snapshot.error).toBe('not your turn');
    const stream = {} as MediaStream;
    t.audio(stream);
    expect(session.snapshot.stream).toBe(stream);
  });

  it('sends intents and clears the last error', () => {
    const { t, session, snaps } = setup();
    t.deliver({ t: 'rejected', reason: 'nope' });
    session.act({ type: 'place', slot: 2 });
    expect(t.sent.at(-1)).toEqual({ t: 'intent', intent: { type: 'place', slot: 2 } });
    expect(snaps.at(-1)?.error).toBeNull();
  });

  it('closes its transport on dispose', () => {
    const { t, session } = setup();
    session.dispose();
    expect(t.isClosed()).toBe(true);
  });
});

describe('loadIdentity', () => {
  it('creates an identity once and reuses it', () => {
    const storage = memoryStorage();
    let n = 0;
    const id = () => `id-${++n}`;
    const first = loadIdentity(storage, id);
    expect(first).toEqual({ playerId: 'id-1', secret: 'id-2' });
    expect(loadIdentity(storage, id)).toEqual(first);
  });
  it('replaces a corrupt identity', () => {
    const storage = memoryStorage();
    storage.setItem(IDENTITY_KEY, '{"playerId":5}');
    expect(loadIdentity(storage, () => 'x')).toEqual({ playerId: 'x', secret: 'x' });
  });
});
