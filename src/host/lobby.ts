import type { TeamSetup } from '../engine/game';

export const MAX_PLAYERS = 8;

export const TEAMS = ['Vinyl', 'Cassette', 'Mixtape', 'Jukebox', 'Radio', 'Walkman', 'MiniDisc', 'Boombox'].map(
  (name, i) => ({ id: `team-${i}`, name }),
);

export function teamNameOf(teamId: string): string {
  return TEAMS.find((t) => t.id === teamId)?.name ?? teamId;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  teamId: string;
  connected: boolean;
  isHost: boolean;
}

export interface LobbySettings {
  cardsToWin: number;
  startingTokens: number;
  stealWindowSec: number;
}

export interface Lobby {
  players: LobbyPlayer[];
  settings: LobbySettings;
  started: boolean;
}

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = { cardsToWin: 10, startingTokens: 2, stealWindowSec: 30 };

const LIMITS: Record<keyof LobbySettings, [number, number]> = {
  cardsToWin: [2, 20],
  startingTokens: [0, 5],
  stealWindowSec: [2, 60],
};

export type JoinResult = { ok: true; lobby: Lobby } | { ok: false; reason: string };

export function createLobby(host: { id: string; name: string }): Lobby {
  return {
    players: [{ id: host.id, name: host.name, teamId: TEAMS[0].id, connected: true, isHost: true }],
    settings: { ...DEFAULT_LOBBY_SETTINGS },
    started: false,
  };
}

export function joinLobby(lobby: Lobby, p: { id: string; name: string }): JoinResult {
  if (lobby.players.some((x) => x.id === p.id)) {
    return {
      ok: true,
      lobby: { ...lobby, players: lobby.players.map((x) => (x.id === p.id ? { ...x, name: p.name, connected: true } : x)) },
    };
  }
  if (lobby.started) return { ok: false, reason: 'game in progress' };
  if (lobby.players.length >= MAX_PLAYERS) return { ok: false, reason: 'room full' };
  const used = new Set(lobby.players.map((x) => x.teamId));
  const team = TEAMS.find((t) => !used.has(t.id)) ?? TEAMS[0];
  const player: LobbyPlayer = { id: p.id, name: p.name, teamId: team.id, connected: true, isHost: false };
  return { ok: true, lobby: { ...lobby, players: [...lobby.players, player] } };
}

export function setConnected(lobby: Lobby, id: string, connected: boolean): Lobby {
  return { ...lobby, players: lobby.players.map((p) => (p.id === id ? { ...p, connected } : p)) };
}

export function assignTeam(lobby: Lobby, playerId: string, teamId: string): Lobby {
  if (lobby.started || !TEAMS.some((t) => t.id === teamId)) return lobby;
  return { ...lobby, players: lobby.players.map((p) => (p.id === playerId ? { ...p, teamId } : p)) };
}

export function updateSettings(lobby: Lobby, patch: Partial<LobbySettings>): Lobby {
  if (lobby.started) return lobby;
  const settings = { ...lobby.settings };
  for (const key of Object.keys(LIMITS) as (keyof LobbySettings)[]) {
    const v = patch[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const [lo, hi] = LIMITS[key];
    settings[key] = Math.min(hi, Math.max(lo, Math.round(v)));
  }
  return { ...lobby, settings };
}

export function teamSetups(lobby: Lobby): TeamSetup[] {
  return TEAMS.map((t) => ({
    id: t.id,
    name: t.name,
    playerIds: lobby.players.filter((p) => p.teamId === t.id).map((p) => p.id),
  })).filter((t) => t.playerIds.length > 0);
}

export function canStart(lobby: Lobby): boolean {
  return teamSetups(lobby).length >= 2;
}

export function playerTeams(lobby: Lobby): Record<string, string> {
  return Object.fromEntries(lobby.players.map((p) => [p.id, p.teamId]));
}
