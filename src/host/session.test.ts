import { describe, expect, it } from 'vitest';
import { DEMO_TRACKS } from '../music/demo';
import { FakeMusicSource, type ToneOutput } from '../music/fake';
import { type MemoryGuest, MemoryHub } from '../net/memory';
import { seededRandom } from '../util/shuffle';
import { type KeyValueStorage, memoryStorage } from '../util/storage';
import { fakeTimers } from '../util/timer';
import { COUNTDOWN_MS, HostSession, type HostSnapshot, REVEAL_MS, SAVE_KEY } from './session';

const TRACKS = DEMO_TRACKS.slice(0, 10);
const silent: ToneOutput = { start: () => undefined, stop: () => undefined };

function setup(storage: KeyValueStorage = memoryStorage()) {
  const hub = new MemoryHub();
  const music = new FakeMusicSource(silent, TRACKS);
  const timers = fakeTimers();
  const snaps: HostSnapshot[] = [];
  const session = new HostSession({
    transport: hub.host,
    music,
    host: { id: 'host', name: 'Hervé' },
    setTimer: timers.setTimer,
    storage,
    random: seededRandom(1),
    onUpdate: (s) => snaps.push(s),
  });
  const join = (id: string, name: string, secret = `s-${id}`) => {
    const g = hub.connect();
    g.send({ t: 'hello', playerId: id, secret, name });
    return g;
  };
  return { hub, music, timers, snaps, session, join, storage };
}

/** Places at slot 0 and locks in for whichever team is active (host = team-0). */
function playActiveTurn(session: HostSession, guestsByTeam: Record<string, MemoryGuest>) {
  const teamId = session.snapshot().view?.turn?.teamId;
  if (teamId === 'team-0') {
    expect(session.act({ type: 'place', slot: 0 })).toEqual({ ok: true });
    expect(session.act({ type: 'lockIn' })).toEqual({ ok: true });
    return;
  }
  const g = guestsByTeam[teamId ?? ''];
  g.send({ t: 'intent', intent: { type: 'place', slot: 0 } });
  g.send({ t: 'intent', intent: { type: 'lockIn' } });
}

describe('HostSession lobby', () => {
  it('adds a guest on hello and broadcasts the lobby', () => {
    const { session, join, snaps } = setup();
    const lea = join('p1', 'Léa');
    expect(lea.last()).toEqual({ t: 'lobby', lobby: session.snapshot().lobby });
    expect(session.snapshot().lobby.players.map((p) => [p.name, p.teamId, p.connected])).toEqual([
      ['Hervé', 'team-0', true],
      ['Léa', 'team-1', true],
    ]);
    expect(snaps.at(-1)?.lobby.players).toHaveLength(2);
  });

  it('rejects garbage, the host id and a wrong secret', () => {
    const { hub, join } = setup();
    const g = hub.connect();
    g.sendRaw({ nope: 1 });
    expect(g.last()).toEqual({ t: 'rejected', reason: 'bad message' });
    expect(join('host', 'Evil').last()).toEqual({ t: 'rejected', reason: 'invalid player' });
    join('p1', 'Léa');
    expect(join('p1', 'Léa', 'wrong').last()).toEqual({ t: 'rejected', reason: 'invalid player' });
  });

  it('requires hello before intents', () => {
    const { hub } = setup();
    const g = hub.connect();
    g.send({ t: 'intent', intent: { type: 'skip' } });
    expect(g.last()).toEqual({ t: 'rejected', reason: 'say hello first' });
  });

  it('marks a player offline on disconnect and online again on reconnect', () => {
    const { session, join } = setup();
    join('p1', 'Léa').close();
    expect(session.snapshot().lobby.players[1].connected).toBe(false);
    join('p1', 'Léa');
    expect(session.snapshot().lobby.players[1].connected).toBe(true);
  });

  it('lets only the newest tab of a player act', () => {
    const { session, join } = setup();
    const oldTab = join('p1', 'Léa');
    join('p1', 'Léa');
    session.assignTeam('p1', 'team-1');
    session.startGame(TRACKS);
    oldTab.send({ t: 'intent', intent: { type: 'skip' } });
    expect(oldTab.last()).toEqual({ t: 'rejected', reason: 'say hello first' });
    expect(session.snapshot().lobby.players[1].connected).toBe(true);
  });

  it('binds one connection to one player', () => {
    const { session, hub } = setup();
    const g = hub.connect();
    g.send({ t: 'hello', playerId: 'p1', secret: 's1', name: 'Léa' });
    g.send({ t: 'hello', playerId: 'p2', secret: 's2', name: 'Ghost' });
    expect(g.last()).toEqual({ t: 'rejected', reason: 'one player per connection' });
    expect(session.snapshot().lobby.players.map((p) => p.name)).toEqual(['Hervé', 'Léa']);
  });

  it('tells a replaced tab it was opened elsewhere', () => {
    const { join } = setup();
    const oldTab = join('p1', 'Léa');
    join('p1', 'Léa');
    expect(oldTab.received).toContainEqual({ t: 'rejected', reason: 'opened in another tab' });
  });

  it('refuses a ninth player', () => {
    const { join } = setup();
    for (let i = 1; i <= 7; i++) join(`p${i}`, `P${i}`);
    expect(join('p8', 'P8').last()).toEqual({ t: 'rejected', reason: 'room full' });
  });
});

describe('HostSession game', () => {
  it('needs two teams to start', () => {
    const { session, join } = setup();
    expect(session.startGame(TRACKS)).toEqual({ ok: false, reason: 'need at least 2 teams' });
    join('p1', 'Léa');
    session.assignTeam('p1', 'team-0');
    expect(session.startGame(TRACKS)).toEqual({ ok: false, reason: 'need at least 2 teams' });
  });

  it('rejects intents before the start and newcomers after it', () => {
    const { session, join } = setup();
    const lea = join('p1', 'Léa');
    lea.send({ t: 'intent', intent: { type: 'skip' } });
    expect(lea.last()).toEqual({ t: 'rejected', reason: 'game not started' });
    session.startGame(TRACKS);
    expect(join('p9', 'Late').last()).toEqual({ t: 'rejected', reason: 'game in progress' });
  });

  it('sends each connection its own filtered view', () => {
    const { session, join } = setup();
    const lea = join('p1', 'Léa');
    const marco = join('p2', 'Marco');
    session.updateSettings({ stealWindowSec: 7 });
    expect(session.startGame(TRACKS)).toEqual({ ok: true });
    const l = lea.last();
    const m = marco.last();
    if (l?.t !== 'state' || m?.t !== 'state') throw new Error('expected state messages');
    expect(l.view.viewerTeamId).toBe('team-1');
    expect(m.view.viewerTeamId).toBe('team-2');
    expect(l.audio).toBe('countdown');
    expect(l.stealWindowMs).toBe(7000);
    expect(session.snapshot().view?.viewerTeamId).toBe('team-0');
  });

  it('never sends the current track before the reveal', () => {
    const { session, join, timers, music } = setup();
    const lea = join('p1', 'Léa');
    session.startGame(TRACKS);
    timers.fire(COUNTDOWN_MS);
    const current = TRACKS.find((t) => t.id === music.played[0]);
    if (!current) throw new Error('nothing playing');
    const wire = JSON.stringify(lea.received);
    expect(wire).not.toContain(current.title);
    expect(wire).not.toContain(current.id);
  });

  it('routes intents and reports rejections to the sender', () => {
    const { session, join } = setup();
    const lea = join('p1', 'Léa');
    session.startGame(TRACKS);
    const active = session.snapshot().view?.turn?.teamId;
    lea.send({ t: 'intent', intent: { type: 'place', slot: 0 } });
    if (active === 'team-1') expect(session.snapshot().view?.turn?.slot).toBe(0);
    else expect(lea.last()).toEqual({ t: 'rejected', reason: 'not your turn' });
    lea.send({ t: 'intent', intent: { type: 'place', slot: 'x' } });
    expect(lea.last()).toEqual({ t: 'rejected', reason: 'malformed intent' });
  });

  it('plays after the countdown, stops at the reveal, then moves on', () => {
    const { session, join, timers, music } = setup();
    const lea = join('p1', 'Léa');
    session.startGame(TRACKS);
    expect(session.snapshot().audio).toBe('countdown');
    expect(music.played).toEqual([]);
    timers.fire(COUNTDOWN_MS);
    expect(session.snapshot().audio).toBe('playing');
    expect(music.played).toHaveLength(1);
    playActiveTurn(session, { 'team-1': lea });
    expect(session.snapshot().view?.phase).toBe('stealWindow');
    timers.fire(5000);
    expect(session.snapshot().view?.phase).toBe('reveal');
    expect(session.snapshot().audio).toBe('stopped');
    timers.fire(REVEAL_MS);
    expect(session.snapshot().view?.phase).toBe('deciding');
    expect(session.snapshot().audio).toBe('countdown');
  });

  it('skips to another track when playback fails, at no token cost', () => {
    const { session, join, timers, music } = setup();
    join('p1', 'Léa');
    session.startGame(TRACKS);
    music.failNext = true;
    timers.fire(COUNTDOWN_MS);
    expect(session.snapshot().audio).toBe('countdown');
    timers.fire(COUNTDOWN_MS);
    expect(music.played).toHaveLength(1);
    expect(session.snapshot().view?.teams.map((t) => t.tokens)).toEqual([2, 2]);
  });

  it('restores a saved game after a host reload', () => {
    const storage = memoryStorage();
    const a = setup(storage);
    a.join('p1', 'Léa', 'sec');
    a.session.startGame(TRACKS);
    a.timers.fire(COUNTDOWN_MS);
    const before = a.session.snapshot().view;
    a.session.dispose();

    const b = setup(storage);
    expect(b.session.snapshot().view).toEqual(before);
    expect(b.session.snapshot().lobby.players.find((p) => p.id === 'p1')?.connected).toBe(false);
    expect(b.session.snapshot().audio).toBe('countdown');
    expect(b.join('p1', 'Léa', 'wrong').last()).toEqual({ t: 'rejected', reason: 'invalid player' });
    expect(b.join('p1', 'Léa', 'sec').last()?.t).toBe('state');
  });

  it('ignores a corrupt save', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{"v":1,"runtime":"nope"}');
    const { session } = setup(storage);
    expect(session.snapshot().view).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it('reset keeps the room and players but clears the game', () => {
    const { session, join, storage } = setup();
    const lea = join('p1', 'Léa');
    session.startGame(TRACKS);
    session.reset();
    expect(session.snapshot().view).toBeNull();
    expect(session.snapshot().lobby.started).toBe(false);
    expect(session.snapshot().lobby.players).toHaveLength(2);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(lea.last()?.t).toBe('lobby');
  });
});
