import { describe, expect, it } from 'vitest';
import {
  assignTeam,
  canStart,
  createLobby,
  joinLobby,
  type Lobby,
  playerTeams,
  setConnected,
  setMusicInRoom,
  teamNameOf,
  teamSetups,
  updateSettings,
} from './lobby';

const HOST = { id: 'host', name: 'Hervé' };
const okJoin = (l: Lobby, id: string, name: string): Lobby => {
  const r = joinLobby(l, { id, name });
  if (!r.ok) throw new Error(r.reason);
  return r.lobby;
};

describe('lobby', () => {
  it('starts with the host alone on the first team', () => {
    expect(createLobby(HOST)).toEqual({
      players: [{ id: 'host', name: 'Hervé', teamId: 'team-0', connected: true, isHost: true }],
      settings: { cardsToWin: 10, startingTokens: 2, stealWindowSec: 30 },
      started: false,
      musicInRoom: false,
    });
    expect(teamNameOf('team-0')).toBe('Vinyl');
  });

  it('puts each new player on the first free team (solo by default)', () => {
    const l = okJoin(okJoin(createLobby(HOST), 'p1', 'Léa'), 'p2', 'Marco');
    expect(l.players.map((p) => [p.name, p.teamId])).toEqual([
      ['Hervé', 'team-0'],
      ['Léa', 'team-1'],
      ['Marco', 'team-2'],
    ]);
  });

  it('lets a known player rejoin (renamed, back online), even mid-game', () => {
    let l = okJoin(createLobby(HOST), 'p1', 'Léa');
    l = { ...setConnected(l, 'p1', false), started: true };
    l = okJoin(l, 'p1', 'Léa B');
    expect(l.players[1]).toMatchObject({ name: 'Léa B', connected: true, teamId: 'team-1' });
  });

  it('refuses newcomers once started or when full', () => {
    expect(joinLobby({ ...createLobby(HOST), started: true }, { id: 'p1', name: 'Léa' })).toEqual({
      ok: false,
      reason: 'game in progress',
    });
    let l = createLobby(HOST);
    for (let i = 1; i < 8; i++) l = okJoin(l, `p${i}`, `P${i}`);
    expect(joinLobby(l, { id: 'p8', name: 'P8' })).toEqual({ ok: false, reason: 'room full' });
  });

  it('assigns teams, ignoring unknown teams and started lobbies', () => {
    let l = okJoin(createLobby(HOST), 'p1', 'Léa');
    l = assignTeam(l, 'p1', 'team-0');
    expect(l.players[1].teamId).toBe('team-0');
    expect(assignTeam(l, 'p1', 'team-99')).toBe(l);
    expect(assignTeam({ ...l, started: true }, 'p1', 'team-3').players[1].teamId).toBe('team-0');
  });

  it('clamps settings and ignores non-numbers', () => {
    const l = updateSettings(createLobby(HOST), { cardsToWin: 50, startingTokens: -2, stealWindowSec: 3.6 });
    expect(l.settings).toEqual({ cardsToWin: 20, startingTokens: 0, stealWindowSec: 4 });
    expect(updateSettings(l, { cardsToWin: Number.NaN, stealWindowSec: Number('') - Number.POSITIVE_INFINITY }).settings).toEqual(
      l.settings,
    );
  });

  it('defaults the steal window to 30 s', () => {
    expect(createLobby(HOST).settings.stealWindowSec).toBe(30);
  });

  it('accepts steal windows up to 60 s and clamps above', () => {
    const l = createLobby(HOST);
    expect(updateSettings(l, { stealWindowSec: 60 }).settings.stealWindowSec).toBe(60);
    expect(updateSettings(l, { stealWindowSec: 90 }).settings.stealWindowSec).toBe(60);
  });

  it('groups players into team setups in team order and needs two teams', () => {
    let l = okJoin(okJoin(createLobby(HOST), 'p1', 'Léa'), 'p2', 'Marco');
    l = assignTeam(l, 'p2', 'team-0');
    expect(teamSetups(l)).toEqual([
      { id: 'team-0', name: 'Vinyl', playerIds: ['host', 'p2'] },
      { id: 'team-1', name: 'Cassette', playerIds: ['p1'] },
    ]);
    expect(canStart(l)).toBe(true);
    expect(canStart(assignTeam(l, 'p1', 'team-0'))).toBe(false);
    expect(playerTeams(l)).toEqual({ host: 'team-0', p1: 'team-1', p2: 'team-0' });
  });

  it('switches the music to the room until the game starts', () => {
    const l = setMusicInRoom(createLobby(HOST), true);
    expect(l.musicInRoom).toBe(true);
    expect(setMusicInRoom(l, false).musicInRoom).toBe(false);
    const started = { ...l, started: true };
    expect(setMusicInRoom(started, false)).toBe(started);
  });
});
