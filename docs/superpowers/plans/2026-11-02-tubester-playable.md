# TUBESTER Playable Game (Plan 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TUBESTER playable end to end in browsers: a host creates a room, friends join from their phones over PeerJS, everyone hears the host's audio, and the full rules run on the mockup screens, using a demo playlist played as test tones.

**Architecture:** Plan 1's pure core stays untouched except one additive field. New pure, unit-tested layers sit on top: `lobby` (players and teams before the game), `protocol` (validated messages), `HostSession` (lobby + runtime + music + transport glue) and `GuestSession`. They talk to an abstract `HostTransport`/`GuestTransport`; an in-memory hub implements it for unit tests and a PeerJS adapter implements it for real. Music is a `FakeMusicSource` driving a WebAudio tone whose `MediaStreamTrack` the host streams to guests, standing in for Spotify plus tab capture (Plan 3). React screens follow the approved mockups, and Playwright plays a real 3-browser game against a local PeerJS server.

**Tech Stack:** TypeScript 7 (`tsc` native, no JS API), React 19, Vite 8, Vitest 5, PeerJS 1.5 (client) + `peer` 1.0 (local signaling server for e2e), Playwright 1.64 (Chromium), Biome 2.6 (lint).

**Spec:** `docs/superpowers/specs/2026-11-01-tubester-design.md` (protocol section updated in this plan's commit: `hello` carries a `secret`, plus `lobby` and `state{…audio,stealWindowMs}` messages).

**Out of scope (Plan 3):** Spotify login/playlists/Web Playback SDK, tab-audio capture, MusicBrainz year review screen, GitHub Pages deploy, real-device manual checklist.

## Global Constraints

- Brand is **TUBESTER**; the steal button reads **"TUBESTER!"**. Never "Hitster" anywhere.
- Group size 2–8 devices (`MAX_PLAYERS = 8`, host included); solo by default, optional teams; ≥ 2 teams to start.
- Lobby settings limits: cards to win 2–20 (default 10), starting tokens 0–5 (default 2), steal window 2–15 s (default 5). Token cap 5 and buy cost 3 come from engine defaults.
- Countdown before each track: **3 s**; reveal auto-advances after **5 s** (host can press **Next**).
- Before the reveal, the current track's title, artists, year and trackId never leave the host (only `HostRuntime.viewFor` output is sent).
- Guests are untrusted: every guest message goes through `parseGuestMessage`, every intent through `HostRuntime.handleIntent`; a player id can only be reclaimed with its secret; nobody can use the host's id.
- Mobile-first: guest screens work at 360 px wide with no horizontal scroll; tap targets ≥ 44 px; host requires a desktop browser.
- Look (approved mockups): ground `#0F1115`, surfaces `#1A1D24`, text `#F2F0EA`, muted `#9AA0AC`; yellow `#FFD23F` = you, orange `#FF8A4C` = steal, blue `#5AB0FF` = others/status; Space Grotesk + Inter; no emoji.
- Git: branch `feat/playable` from `main`; never commit on `main`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push as `k3rmitt` (repo-local credential helper already set).
- Typecheck uses `tsc` 7 (native). Do not add tools that need the TypeScript JS API (e.g. typescript-eslint); lint is Biome.

## Review Focus

1. **Player impersonation** — player ids are public in views; a guest sending `hello` with someone else's id (or the host's id) must be rejected unless it has that player's secret. Tests in Task 5.
2. **Same identity in two tabs** — the newest connection wins and the older one can no longer act (`say hello first`). Test in Task 5.
3. **Host reload mid-game** — saved session restores the game, players come back as they reconnect, audio restarts with a countdown. Unit test in Task 5, end-to-end test in Task 11.
4. **Narrow phones** — at 360 px wide, the guest screens never scroll sideways. Asserted in Task 11.
5. **Settings typed as garbage** — empty or non-numeric settings inputs keep the previous value instead of becoming `NaN`. Test in Task 3.

---

## File Structure

```
biome.json                          lint config (Task 1)
src/util/shuffle.ts                 shuffle, seededRandom
src/util/storage.ts                 KeyValueStorage, memoryStorage
src/util/timer.ts                   browserTimer, fakeTimers (test helper)
src/net/protocol.ts                 GuestToHost/HostToGuest, AudioState, parseGuestMessage
src/net/room.ts                     newRoomCode, peerIdFor
src/net/transport.ts                HostTransport, GuestTransport, GuestStatus
src/net/memory.ts                   MemoryHub (in-memory transport for tests)
src/net/peer.ts                     PeerJS adapters (browser only)
src/host/lobby.ts                   lobby state: players, teams, settings
src/host/session.ts                 HostSession
src/guest/session.ts                GuestSession, loadIdentity
src/music/demo.ts                   DEMO_TRACKS (40 well-known songs)
src/music/fake.ts                   FakeMusicSource, ToneOutput, freqFor
src/music/tone.ts                   createToneFeed (WebAudio, browser only)
src/host/view.ts                    + TurnView.seq (Task 8)
src/ui/theme.css                    design tokens and component styles
src/ui/router.ts                    parseRoute, useRoute, joinUrl
src/ui/text.ts                      slotLabel, teamById, revealHeadline, winnersHeadline
src/ui/keys.ts                      localStorage keys
src/ui/components.tsx               Wordmark, TokenChip, Scores, Disc, NowPlaying, Timeline
src/ui/PlayPanel.tsx                shared in-game panel (my turn / steal / watching / reveal / finished)
src/ui/Home.tsx, GuestApp.tsx, HostApp.tsx, HostLobby.tsx, HostBoard.tsx
src/App.tsx, src/main.tsx, index.html, public/manifest.webmanifest, public/icon.svg
playwright.config.ts, e2e/game.spec.ts
```

---

### Task 1: Biome lint in CI

**Files:**
- Create: `biome.json`
- Modify: `package.json` (scripts), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run lint` (used by CI and every later task's final check).

- [ ] **Step 1: Create the branch and install Biome**

```bash
cd /Users/herve.bourzeix/dev/perso/tubester
git checkout main && git pull --ff-only
git checkout -b feat/playable
npm install -D @biomejs/biome@2.6.4
```

- [ ] **Step 2: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.6.4/schema.json",
  "files": { "includes": ["src/**", "e2e/**", "*.ts"] },
  "formatter": { "enabled": false },
  "assist": { "enabled": false },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

- [ ] **Step 3: Add the script** — in `package.json` `scripts`, add `"lint": "biome lint ."`.

- [ ] **Step 4: Run it on the existing code**

Run: `npm run lint`
Expected: exits 0. If recommended rules flag existing Plan 1 code, fix the code when the fix is behaviour-neutral; if a rule conflicts with an intentional idiom (e.g. the `never` exhaustiveness variable), disable that single rule in `biome.json` under `linter.rules.<group>.<rule>: "off"` and ledger a ruling naming it.

- [ ] **Step 5: Add lint to CI** — in `.github/workflows/ci.yml`, add `- run: npm run lint` right after `- run: npm ci`.

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass (120 tests).

```bash
git add -A
git commit -m "chore: add Biome lint and run it in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Utilities and the wire protocol

**Files:**
- Create: `src/util/shuffle.ts`, `src/util/storage.ts`, `src/util/timer.ts`, `src/net/protocol.ts`, `src/net/room.ts`
- Test: `src/util/shuffle.test.ts`, `src/util/storage.test.ts`, `src/net/protocol.test.ts`, `src/net/room.test.ts`

**Interfaces:**
- Consumes: `GameView` (Plan 1 `src/host/view.ts`); `Lobby` from Task 3 (type-only import — write Task 3's file before running typecheck in this task's last step, or keep the import and run typecheck at the end of Task 3).
- Produces:
  - `shuffle<T>(items: readonly T[], random?: () => number): T[]`, `seededRandom(seed: number): () => number`
  - `type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`, `memoryStorage(): KeyValueStorage`
  - `type SetTimer = (fn: () => void, ms: number) => () => void`, `browserTimer: SetTimer`, `fakeTimers(): { setTimer: SetTimer; pending(): number[]; fire(ms?: number): void }`
  - `type AudioState = 'countdown' | 'playing' | 'stopped'`
  - `type GuestToHost = { t: 'hello'; playerId: string; secret: string; name: string } | { t: 'intent'; intent: unknown }`
  - `type HostToGuest = { t: 'lobby'; lobby: Lobby } | { t: 'state'; view: GameView; lobby: Lobby; audio: AudioState; stealWindowMs: number } | { t: 'rejected'; reason: string }`
  - `MAX_NAME_LENGTH = 24`, `parseGuestMessage(raw: unknown): GuestToHost | null`
  - `newRoomCode(random?: () => number): string` (format `TUBE-XXXX`), `peerIdFor(code: string): string`

- [ ] **Step 1: Write the failing tests**

`src/util/shuffle.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { seededRandom, shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRandom(7));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('is deterministic for a given seed', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seededRandom(3))).toEqual(shuffle([1, 2, 3, 4, 5, 6], seededRandom(3)));
  });
});

describe('seededRandom', () => {
  it('yields numbers in [0, 1)', () => {
    const r = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
```

`src/util/storage.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { memoryStorage } from './storage';

describe('memoryStorage', () => {
  it('stores, reads and removes strings', () => {
    const s = memoryStorage();
    expect(s.getItem('k')).toBeNull();
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });
});
```

`src/net/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseGuestMessage } from './protocol';

describe('parseGuestMessage', () => {
  it('accepts a hello and trims the name to 24 chars', () => {
    expect(parseGuestMessage({ t: 'hello', playerId: 'p1', secret: 's1', name: `  ${'x'.repeat(30)} ` })).toEqual({
      t: 'hello',
      playerId: 'p1',
      secret: 's1',
      name: 'x'.repeat(24),
    });
  });
  it('passes intents through untouched (the runtime validates them)', () => {
    expect(parseGuestMessage({ t: 'intent', intent: { type: 'skip' } })).toEqual({ t: 'intent', intent: { type: 'skip' } });
  });
  it.each([
    ['null', null],
    ['string', 'hello'],
    ['unknown tag', { t: 'admin' }],
    ['blank name', { t: 'hello', playerId: 'p1', secret: 's1', name: '   ' }],
    ['missing secret', { t: 'hello', playerId: 'p1', name: 'Léa' }],
    ['numeric id', { t: 'hello', playerId: 5, secret: 's1', name: 'Léa' }],
    ['huge id', { t: 'hello', playerId: 'p'.repeat(65), secret: 's1', name: 'Léa' }],
  ])('rejects %s', (_label, raw) => {
    expect(parseGuestMessage(raw)).toBeNull();
  });
});
```

`src/net/room.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../util/shuffle';
import { newRoomCode, peerIdFor } from './room';

describe('room codes', () => {
  it('look like TUBE-XXXX without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(/^TUBE-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('are deterministic for a given random source', () => {
    expect(newRoomCode(seededRandom(1))).toBe(newRoomCode(seededRandom(1)));
  });
  it('map to a namespaced PeerJS id', () => {
    expect(peerIdFor('TUBE-7KQ3')).toBe('tubester-tube-7kq3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/util src/net`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/util/shuffle.ts`:
```ts
/** Fisher–Yates; never mutates `items`. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** mulberry32: small deterministic PRNG for tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`src/util/storage.ts`:
```ts
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
}
```

`src/util/timer.ts`:
```ts
/** Schedules `fn` after `ms`; returns a cancel function. */
export type SetTimer = (fn: () => void, ms: number) => () => void;

export const browserTimer: SetTimer = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Manual timers for tests: `fire(ms)` runs the oldest pending timer with that delay. */
export function fakeTimers() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const setTimer: SetTimer = (fn, ms) => {
    const t = { fn, ms, cancelled: false };
    timers.push(t);
    return () => {
      t.cancelled = true;
    };
  };
  const pending = () => timers.filter((t) => !t.cancelled).map((t) => t.ms);
  const fire = (ms?: number) => {
    const t = timers.find((x) => !x.cancelled && (ms === undefined || x.ms === ms));
    if (!t) throw new Error(`no pending timer${ms === undefined ? '' : ` of ${ms}ms`}`);
    t.cancelled = true;
    t.fn();
  };
  return { setTimer, pending, fire };
}
```

`src/net/protocol.ts`:
```ts
import type { Lobby } from '../host/lobby';
import type { GameView } from '../host/view';

export type AudioState = 'countdown' | 'playing' | 'stopped';

export type GuestToHost =
  | { t: 'hello'; playerId: string; secret: string; name: string }
  | { t: 'intent'; intent: unknown };

export type HostToGuest =
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'state'; view: GameView; lobby: Lobby; audio: AudioState; stealWindowMs: number }
  | { t: 'rejected'; reason: string };

export const MAX_NAME_LENGTH = 24;
const MAX_ID_LENGTH = 64;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** Guests are untrusted: only well-formed messages get through. Intents are validated later by HostRuntime. */
export function parseGuestMessage(raw: unknown): GuestToHost | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.t === 'hello') {
    if (!isId(r.playerId) || !isId(r.secret) || typeof r.name !== 'string') return null;
    const name = r.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) return null;
    return { t: 'hello', playerId: r.playerId, secret: r.secret, name };
  }
  if (r.t === 'intent') return { t: 'intent', intent: r.intent };
  return null;
}
```

`src/net/room.ts`:
```ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `TUBE-${s}`;
}

/** PeerJS ids are global on the public broker, so namespace them. */
export function peerIdFor(code: string): string {
  return `tubester-${code.toLowerCase()}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/util src/net`
Expected: PASS. (Typecheck waits for Task 3's `lobby.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/util src/net
git commit -m "feat(net): wire protocol, room codes and small utilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lobby

**Files:**
- Create: `src/host/lobby.ts`
- Test: `src/host/lobby.test.ts`

**Interfaces:**
- Consumes: `TeamSetup` from `src/engine/game.ts`.
- Produces:
  - `MAX_PLAYERS = 8`, `TEAMS: { id: string; name: string }[]` (`team-0` Vinyl … `team-7` Boombox), `teamNameOf(teamId): string`
  - `interface LobbyPlayer { id: string; name: string; teamId: string; connected: boolean; isHost: boolean }`
  - `interface LobbySettings { cardsToWin: number; startingTokens: number; stealWindowSec: number }`, `DEFAULT_LOBBY_SETTINGS`
  - `interface Lobby { players: LobbyPlayer[]; settings: LobbySettings; started: boolean }`
  - `createLobby(host: { id: string; name: string }): Lobby`
  - `joinLobby(lobby, p: { id; name }): { ok: true; lobby: Lobby } | { ok: false; reason: string }` — reasons `'game in progress'`, `'room full'`
  - `setConnected(lobby, id, connected): Lobby`, `assignTeam(lobby, playerId, teamId): Lobby`, `updateSettings(lobby, patch: Partial<LobbySettings>): Lobby`
  - `teamSetups(lobby): TeamSetup[]`, `canStart(lobby): boolean`, `playerTeams(lobby): Record<string, string>`

- [ ] **Step 1: Write the failing test** — `src/host/lobby.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  assignTeam,
  canStart,
  createLobby,
  joinLobby,
  type Lobby,
  playerTeams,
  setConnected,
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
      settings: { cardsToWin: 10, startingTokens: 2, stealWindowSec: 5 },
      started: false,
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/host/lobby.test.ts`
Expected: FAIL — cannot resolve `./lobby`.

- [ ] **Step 3: Write `src/host/lobby.ts`**

```ts
import type { TeamSetup } from '../engine/game';

export const MAX_PLAYERS = 8;

export const TEAMS = ['Vinyl', 'Cassette', 'Mixtape', 'Jukebox', 'Radio', 'Walkman', 'Turntable', 'Boombox'].map(
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

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = { cardsToWin: 10, startingTokens: 2, stealWindowSec: 5 };

const LIMITS: Record<keyof LobbySettings, [number, number]> = {
  cardsToWin: [2, 20],
  startingTokens: [0, 5],
  stealWindowSec: [2, 15],
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
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/host/lobby.test.ts && npm run typecheck && npm run lint`
Expected: PASS, clean (Task 2's protocol import now resolves).

- [ ] **Step 5: Commit**

```bash
git add src/host/lobby.ts src/host/lobby.test.ts
git commit -m "feat(host): lobby with solo-by-default teams and clamped settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Demo playlist and fake music source

**Files:**
- Create: `src/music/demo.ts`, `src/music/fake.ts`
- Test: `src/music/fake.test.ts`

**Interfaces:**
- Consumes: `Track`, `MusicSource`, `PlaybackError`, `PlaylistSummary` (Plan 1 `src/music/types.ts`).
- Produces:
  - `DEMO_TRACKS: Track[]` (40 tracks, ids `demo-01`…`demo-40`)
  - `interface ToneOutput { start(frequency: number): void; stop(): void }`
  - `DEMO_PLAYLIST_ID = 'demo'`, `freqFor(trackId: string): number` (220–659 Hz)
  - `class FakeMusicSource implements MusicSource` with public `played: string[]` and `failNext: boolean` (next `play` emits an error instead of playing)

- [ ] **Step 1: Write the failing test** — `src/music/fake.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEMO_TRACKS } from './demo';
import { FakeMusicSource, freqFor, type ToneOutput } from './fake';
import type { PlaybackError } from './types';

function recorder() {
  const calls: string[] = [];
  const tone: ToneOutput = {
    start: (f) => calls.push(`start ${f}`),
    stop: () => calls.push('stop'),
  };
  return { tone, calls };
}

describe('DEMO_TRACKS', () => {
  it('has 40 well-formed tracks with unique ids', () => {
    expect(DEMO_TRACKS).toHaveLength(40);
    expect(new Set(DEMO_TRACKS.map((t) => t.id)).size).toBe(40);
    for (const t of DEMO_TRACKS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.artists.length).toBeGreaterThan(0);
      expect(t.sourceYear).toBeGreaterThanOrEqual(1950);
      expect(t.sourceYear).toBeLessThanOrEqual(2025);
    }
  });
});

describe('freqFor', () => {
  it('is deterministic and audible', () => {
    expect(freqFor('demo-01')).toBe(freqFor('demo-01'));
    for (const t of DEMO_TRACKS) {
      expect(freqFor(t.id)).toBeGreaterThanOrEqual(220);
      expect(freqFor(t.id)).toBeLessThan(660);
    }
  });
});

describe('FakeMusicSource', () => {
  it('exposes one demo playlist and returns copies of its tracks', async () => {
    const src = new FakeMusicSource(recorder().tone);
    expect(await src.listPlaylists()).toEqual([{ id: 'demo', name: 'Demo hits', trackCount: 40 }]);
    const tracks = await src.loadPlaylist('demo');
    tracks[0].artists.push('mutated');
    expect(DEMO_TRACKS[0].artists).toHaveLength(1);
    await expect(src.loadPlaylist('nope')).rejects.toThrow('unknown playlist nope');
  });

  it('plays a tone per track and stops it', async () => {
    const { tone, calls } = recorder();
    const src = new FakeMusicSource(tone);
    await src.play('demo-03');
    await src.stop();
    expect(calls).toEqual([`start ${freqFor('demo-03')}`, 'stop']);
    expect(src.played).toEqual(['demo-03']);
  });

  it('can simulate a playback failure once', async () => {
    const { tone, calls } = recorder();
    const src = new FakeMusicSource(tone);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    src.failNext = true;
    await src.play('demo-05');
    await src.play('demo-06');
    expect(errors).toEqual([{ trackId: 'demo-05', message: 'simulated failure' }]);
    expect(src.played).toEqual(['demo-06']);
    expect(calls).toEqual([`start ${freqFor('demo-06')}`]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/music/fake.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/music/demo.ts`:
```ts
import type { Track } from './types';

const RAW: [title: string, artist: string, year: number][] = [
  ['Hound Dog', 'Elvis Presley', 1956],
  ['Johnny B. Goode', 'Chuck Berry', 1958],
  ['I Want to Hold Your Hand', 'The Beatles', 1963],
  ["(I Can't Get No) Satisfaction", 'The Rolling Stones', 1965],
  ['Respect', 'Aretha Franklin', 1967],
  ['Here Comes the Sun', 'The Beatles', 1969],
  ['Imagine', 'John Lennon', 1971],
  ['Superstition', 'Stevie Wonder', 1972],
  ['Waterloo', 'ABBA', 1974],
  ['Bohemian Rhapsody', 'Queen', 1975],
  ['Dancing Queen', 'ABBA', 1976],
  ['Hotel California', 'Eagles', 1976],
  ["Stayin' Alive", 'Bee Gees', 1977],
  ['Le Freak', 'Chic', 1978],
  ['Another One Bites the Dust', 'Queen', 1980],
  ['Africa', 'Toto', 1982],
  ['Sweet Dreams (Are Made of This)', 'Eurythmics', 1983],
  ['Purple Rain', 'Prince', 1984],
  ['Smooth Criminal', 'Michael Jackson', 1987],
  ['Like a Prayer', 'Madonna', 1989],
  ['Smells Like Teen Spirit', 'Nirvana', 1991],
  ['Wonderwall', 'Oasis', 1995],
  ['Wannabe', 'Spice Girls', 1996],
  ['...Baby One More Time', 'Britney Spears', 1998],
  ['Seven Nation Army', 'The White Stripes', 2003],
  ['Hey Ya!', 'Outkast', 2003],
  ['Crazy in Love', 'Beyoncé', 2003],
  ['Mr. Brightside', 'The Killers', 2003],
  ['Crazy', 'Gnarls Barkley', 2006],
  ['Rolling in the Deep', 'Adele', 2010],
  ['Somebody That I Used to Know', 'Gotye', 2011],
  ['Get Lucky', 'Daft Punk', 2013],
  ['Happy', 'Pharrell Williams', 2013],
  ['Uptown Funk', 'Mark Ronson', 2014],
  ['Shape of You', 'Ed Sheeran', 2017],
  ['Blinding Lights', 'The Weeknd', 2019],
  ['Bad Guy', 'Billie Eilish', 2019],
  ['Levitating', 'Dua Lipa', 2020],
  ['As It Was', 'Harry Styles', 2022],
  ['Flowers', 'Miley Cyrus', 2023],
];

export const DEMO_TRACKS: Track[] = RAW.map(([title, artist, year], i) => ({
  id: `demo-${String(i + 1).padStart(2, '0')}`,
  title,
  artists: [artist],
  sourceYear: year,
}));
```

`src/music/fake.ts`:
```ts
import { DEMO_TRACKS } from './demo';
import type { MusicSource, PlaybackError, PlaylistSummary, Track } from './types';

export interface ToneOutput {
  start(frequency: number): void;
  stop(): void;
}

export const DEMO_PLAYLIST_ID = 'demo';

/** A stable pitch per track, so players can tell tracks apart in demo mode. */
export function freqFor(trackId: string): number {
  let h = 0;
  for (const ch of trackId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 220 + (h % 440);
}

/** Stand-in for Spotify until Plan 3: plays a test tone per track. */
export class FakeMusicSource implements MusicSource {
  readonly played: string[] = [];
  failNext = false;
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(
    private readonly tone: ToneOutput,
    private readonly tracks: Track[] = DEMO_TRACKS,
  ) {}

  async listPlaylists(): Promise<PlaylistSummary[]> {
    return [{ id: DEMO_PLAYLIST_ID, name: 'Demo hits', trackCount: this.tracks.length }];
  }

  async loadPlaylist(id: string): Promise<Track[]> {
    if (id !== DEMO_PLAYLIST_ID) throw new Error(`unknown playlist ${id}`);
    return this.tracks.map((t) => ({ ...t, artists: [...t.artists] }));
  }

  async ready(): Promise<void> {}

  async play(trackId: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      for (const cb of this.errorCbs) cb({ trackId, message: 'simulated failure' });
      return;
    }
    this.played.push(trackId);
    this.tone.start(freqFor(trackId));
  }

  async stop(): Promise<void> {
    this.tone.stop();
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/music && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/music
git commit -m "feat(music): demo playlist and fake tone music source

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Transports and HostSession

**Files:**
- Create: `src/net/transport.ts`, `src/net/memory.ts`, `src/host/session.ts`
- Test: `src/host/session.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; Plan 1 `createGame`, `DEFAULT_SETTINGS`, `HostRuntime` (`handleIntent(playerId, raw: unknown)`, `command`, `viewFor`, `serialize`, `static restore`, `dispose`), `GameView`, `TrackMeta`, `Track`.
- Produces:
  - `interface HostTransport { onMessage(cb: (connId: string, msg: unknown) => void): void; onDisconnect(cb: (connId: string) => void): void; send(connId: string, msg: HostToGuest): void; setAudioTrack(track: MediaStreamTrack | null): void; close(): void }`
  - `type GuestStatus = 'connecting' | 'open' | 'closed'`
  - `interface GuestTransport { onStatus(cb: (s: GuestStatus) => void): void; onMessage(cb: (msg: HostToGuest) => void): void; onAudio(cb: (stream: MediaStream) => void): void; send(msg: GuestToHost): void; close(): void }` — `onStatus` immediately reports the current status.
  - `class MemoryHub { host: MemoryHostTransport; connect(): MemoryGuest }`; `MemoryGuest` has `connId`, `received: HostToGuest[]`, `last()`, `sendRaw(msg: unknown)`, `close()`.
  - `COUNTDOWN_MS = 3000`, `REVEAL_MS = 5000`, `SAVE_KEY = 'tubester.host'`
  - `type GameTrack = Track & { year?: number }` (Plan 3 passes MusicBrainz-resolved years in `year`)
  - `interface HostSnapshot { lobby: Lobby; view: GameView | null; audio: AudioState }`
  - `interface HostSessionDeps { transport: HostTransport; music: MusicSource; host: { id: string; name: string }; setTimer: SetTimer; storage: KeyValueStorage; random?: () => number; onUpdate: (s: HostSnapshot) => void }`
  - `class HostSession { constructor(deps); snapshot(): HostSnapshot; assignTeam(playerId, teamId): void; updateSettings(patch: Partial<LobbySettings>): void; startGame(tracks: GameTrack[]): IntentResult; act(intent: unknown): IntentResult; command(cmd: HostCommand): IntentResult; reset(): void; dispose(): void }` — constructor restores a saved game from `storage[SAVE_KEY]` if present.

- [ ] **Step 1: Write `src/net/transport.ts` and `src/net/memory.ts`** (interfaces and test double; no behaviour to test on their own)

`src/net/transport.ts`:
```ts
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
```

`src/net/memory.ts`:
```ts
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
```

- [ ] **Step 2: Write the failing test** — `src/host/session.test.ts`

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/host/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 4: Write `src/host/session.ts`**

```ts
import { createGame } from '../engine/game';
import { DEFAULT_SETTINGS, type GameState, type TrackId } from '../engine/types';
import type { MusicSource, Track } from '../music/types';
import { type AudioState, type HostToGuest, parseGuestMessage } from '../net/protocol';
import type { HostTransport } from '../net/transport';
import { shuffle } from '../util/shuffle';
import type { KeyValueStorage } from '../util/storage';
import type { SetTimer } from '../util/timer';
import {
  assignTeam,
  canStart,
  createLobby,
  joinLobby,
  type Lobby,
  type LobbySettings,
  playerTeams,
  setConnected,
  teamSetups,
  updateSettings,
} from './lobby';
import { type HostCommand, HostRuntime, type IntentResult, type RuntimeDeps } from './runtime';
import type { GameView, TrackMeta } from './view';

export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 5000;
export const SAVE_KEY = 'tubester.host';

/** A track with an optional resolved year (Plan 3 fills `year` from MusicBrainz). */
export type GameTrack = Track & { year?: number };

export interface HostSnapshot {
  lobby: Lobby;
  view: GameView | null;
  audio: AudioState;
}

export interface HostSessionDeps {
  transport: HostTransport;
  music: MusicSource;
  host: { id: string; name: string };
  setTimer: SetTimer;
  storage: KeyValueStorage;
  random?: () => number;
  onUpdate: (snapshot: HostSnapshot) => void;
}

interface SavedSession {
  v: 1;
  lobby: Lobby;
  secrets: Record<string, string>;
  meta: Record<TrackId, TrackMeta>;
  runtime: string;
}

export class HostSession {
  private lobby: Lobby;
  private secrets: Record<string, string> = {};
  private meta: Record<TrackId, TrackMeta> = {};
  private runtime: HostRuntime | null = null;
  /** connection id → player id */
  private readonly conns = new Map<string, string>();
  private audio: AudioState = 'stopped';
  private playingTrack: TrackId | null = null;
  private cancelCountdown: (() => void) | null = null;

  constructor(private readonly deps: HostSessionDeps) {
    this.lobby = createLobby(deps.host);
    deps.transport.onMessage((connId, raw) => this.onMessage(connId, raw));
    deps.transport.onDisconnect((connId) => this.onDisconnect(connId));
    deps.music.onError((e) => this.onMusicError(e.trackId));
    this.restore();
  }

  snapshot(): HostSnapshot {
    return { lobby: this.lobby, view: this.runtime?.viewFor(this.deps.host.id) ?? null, audio: this.audio };
  }

  assignTeam(playerId: string, teamId: string): void {
    this.lobby = assignTeam(this.lobby, playerId, teamId);
    this.broadcast();
  }

  updateSettings(patch: Partial<LobbySettings>): void {
    this.lobby = updateSettings(this.lobby, patch);
    this.broadcast();
  }

  startGame(tracks: GameTrack[]): IntentResult {
    if (this.runtime) return { ok: false, reason: 'game already started' };
    if (!canStart(this.lobby)) return { ok: false, reason: 'need at least 2 teams' };
    const teams = teamSetups(this.lobby);
    if (tracks.length < teams.length + 1) return { ok: false, reason: 'not enough tracks' };

    this.meta = Object.fromEntries(tracks.map((t) => [t.id, { title: t.title, artists: [...t.artists] }]));
    const years = Object.fromEntries(tracks.map((t) => [t.id, t.year ?? t.sourceYear]));
    const deck = shuffle(
      tracks.map((t) => t.id),
      this.deps.random,
    );
    const s = this.lobby.settings;
    const state = createGame(
      { ...DEFAULT_SETTINGS, cardsToWin: s.cardsToWin, startingTokens: s.startingTokens },
      teams,
      deck,
      years,
    );
    this.lobby = { ...this.lobby, started: true };
    this.runtime = new HostRuntime(state, playerTeams(this.lobby), this.runtimeDeps());
    this.onGameChange(state);
    return { ok: true };
  }

  /** The host plays too: its intents go through the same validation as guests'. */
  act(intent: unknown): IntentResult {
    if (!this.runtime) return { ok: false, reason: 'game not started' };
    return this.runtime.handleIntent(this.deps.host.id, intent);
  }

  command(cmd: HostCommand): IntentResult {
    if (!this.runtime) return { ok: false, reason: 'game not started' };
    return this.runtime.command(cmd);
  }

  /** New game in the same room with the same players. */
  reset(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.stopMusic();
    this.deps.storage.removeItem(SAVE_KEY);
    this.lobby = { ...this.lobby, started: false };
    this.broadcast();
  }

  dispose(): void {
    this.runtime?.dispose();
    this.stopMusic();
  }

  private runtimeDeps(): RuntimeDeps {
    return {
      meta: this.meta,
      stealWindowMs: this.lobby.settings.stealWindowSec * 1000,
      revealMs: REVEAL_MS,
      setTimer: this.deps.setTimer,
      onChange: (state) => this.onGameChange(state),
    };
  }

  private restore(): void {
    const raw = this.deps.storage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedSession;
      if (saved.v !== 1 || !saved.lobby || !saved.secrets || !saved.meta) throw new Error('invalid save');
      this.meta = saved.meta;
      this.secrets = saved.secrets;
      this.lobby = {
        ...saved.lobby,
        players: saved.lobby.players.map((p) => ({ ...p, connected: p.id === this.deps.host.id })),
      };
      this.runtime = HostRuntime.restore(saved.runtime, this.runtimeDeps());
      this.syncAudio(this.runtime.state);
    } catch {
      this.deps.storage.removeItem(SAVE_KEY);
      this.runtime = null;
      this.meta = {};
      this.secrets = {};
      this.lobby = createLobby(this.deps.host);
    }
  }

  private onMessage(connId: string, raw: unknown): void {
    const msg = parseGuestMessage(raw);
    if (!msg) return this.send(connId, { t: 'rejected', reason: 'bad message' });
    if (msg.t === 'hello') return this.onHello(connId, msg.playerId, msg.secret, msg.name);
    const playerId = this.conns.get(connId);
    if (!playerId) return this.send(connId, { t: 'rejected', reason: 'say hello first' });
    if (!this.runtime) return this.send(connId, { t: 'rejected', reason: 'game not started' });
    const res = this.runtime.handleIntent(playerId, msg.intent);
    if (!res.ok) this.send(connId, { t: 'rejected', reason: res.reason });
  }

  private onHello(connId: string, playerId: string, secret: string, name: string): void {
    const known = this.secrets[playerId];
    if (playerId === this.deps.host.id || (known !== undefined && known !== secret)) {
      return this.send(connId, { t: 'rejected', reason: 'invalid player' });
    }
    const res = joinLobby(this.lobby, { id: playerId, name });
    if (!res.ok) return this.send(connId, { t: 'rejected', reason: res.reason });
    this.secrets[playerId] = secret;
    for (const [c, p] of this.conns) if (p === playerId) this.conns.delete(c);
    this.conns.set(connId, playerId);
    this.lobby = res.lobby;
    this.persist();
    this.broadcast();
  }

  private onDisconnect(connId: string): void {
    const playerId = this.conns.get(connId);
    if (!playerId) return;
    this.conns.delete(connId);
    if ([...this.conns.values()].includes(playerId)) return;
    this.lobby = setConnected(this.lobby, playerId, false);
    this.broadcast();
  }

  private onGameChange(state: GameState): void {
    this.syncAudio(state);
    this.persist();
    this.broadcast();
  }

  /** One track per turn: countdown, then play; stop at the reveal. */
  private syncAudio(state: GameState): void {
    const live = state.phase === 'deciding' || state.phase === 'stealWindow';
    const current = live ? (state.turn?.trackId ?? null) : null;
    if (current === this.playingTrack) return;
    this.stopMusic();
    this.playingTrack = current;
    if (current === null) return;
    this.audio = 'countdown';
    this.cancelCountdown = this.deps.setTimer(() => {
      this.cancelCountdown = null;
      if (this.playingTrack !== current) return;
      this.audio = 'playing';
      this.deps.music.play(current).catch(() => this.onMusicError(current));
      this.broadcast();
    }, COUNTDOWN_MS);
  }

  private stopMusic(): void {
    this.cancelCountdown?.();
    this.cancelCountdown = null;
    this.playingTrack = null;
    this.audio = 'stopped';
    this.deps.music.stop().catch(() => undefined);
  }

  private onMusicError(trackId: TrackId): void {
    if (!this.runtime || this.playingTrack !== trackId) return;
    this.runtime.command({ type: 'trackFailed' });
  }

  private persist(): void {
    if (!this.runtime) return;
    const saved: SavedSession = {
      v: 1,
      lobby: this.lobby,
      secrets: this.secrets,
      meta: this.meta,
      runtime: this.runtime.serialize(),
    };
    this.deps.storage.setItem(SAVE_KEY, JSON.stringify(saved));
  }

  private broadcast(): void {
    for (const [connId, playerId] of this.conns) {
      const msg: HostToGuest = this.runtime
        ? {
            t: 'state',
            view: this.runtime.viewFor(playerId),
            lobby: this.lobby,
            audio: this.audio,
            stealWindowMs: this.lobby.settings.stealWindowSec * 1000,
          }
        : { t: 'lobby', lobby: this.lobby };
      this.send(connId, msg);
    }
    this.deps.onUpdate(this.snapshot());
  }

  private send(connId: string, msg: HostToGuest): void {
    this.deps.transport.send(connId, msg);
  }
}
```

Note on the music-failure test: `syncAudio` sets `audio = 'playing'` before `play`; the fake's failure fires synchronously inside `play`, `trackFailed` draws a new track, and `syncAudio` resets `audio` to `'countdown'`, which is the expected end state.

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `npx vitest run src/host && npm run typecheck && npm run lint`
Expected: PASS, clean. If `HostRuntime.restore` throws on the corrupt-save fixture before `JSON.parse` of `runtime` (it should: `"nope"` is not JSON), the catch path handles it.

- [ ] **Step 6: Commit**

```bash
git add src/net src/host
git commit -m "feat(host): HostSession glues lobby, runtime, music and transport

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: GuestSession

**Files:**
- Create: `src/guest/session.ts`
- Test: `src/guest/session.test.ts`

**Interfaces:**
- Consumes: `GuestTransport`, `GuestStatus` (Task 5), `HostToGuest`, `AudioState` (Task 2), `GuestIntent` (Plan 1 runtime), `Lobby`, `GameView`, `KeyValueStorage`.
- Produces:
  - `IDENTITY_KEY = 'tubester.identity'`, `interface Identity { playerId: string; secret: string }`, `loadIdentity(storage: KeyValueStorage, newId?: () => string): Identity`
  - `interface GuestSnapshot { status: GuestStatus; playerId: string; lobby: Lobby | null; view: GameView | null; audio: AudioState; stealWindowMs: number; stream: MediaStream | null; error: string | null }`
  - `class GuestSession { constructor(deps: { transport: GuestTransport; identity: Identity; name: string; onUpdate: (s: GuestSnapshot) => void }); get snapshot(): GuestSnapshot; act(intent: GuestIntent): void; dispose(): void }` — sends `hello` on every transition to `open` (so reconnects re-identify).

- [ ] **Step 1: Write the failing test** — `src/guest/session.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createLobby } from '../host/lobby';
import { toView } from '../host/view';
import { newGame } from '../engine/testkit';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/guest`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Write `src/guest/session.ts`**

```ts
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
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/guest && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/guest
git commit -m "feat(guest): GuestSession with per-device identity and auto re-hello

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser adapters — PeerJS transports and tone feed

**Files:**
- Create: `src/net/peer.ts`, `src/music/tone.ts`, `src/vite-env.d.ts`

**Interfaces:**
- Consumes: `HostTransport`, `GuestTransport`, `GuestStatus` (Task 5), `HostToGuest`, `GuestToHost` (Task 2), `peerIdFor` (Task 2), `ToneOutput` (Task 4).
- Produces:
  - `createHostTransport(code: string, attempts?: number): Promise<HostTransport>` — claims PeerJS id `peerIdFor(code)`, retries 2 s apart on `unavailable-id`/network errors (host reload), reconnects to the broker on `disconnected`, calls every guest with the current audio track.
  - `createGuestTransport(code: string): GuestTransport` — connects with `serialization: 'json'`, answers the host's audio call receive-only, retries every 2 s for up to 2 min then reports `closed`.
  - `interface ToneFeed { output: ToneOutput; track: MediaStreamTrack; context: AudioContext; close(): void }`, `createToneFeed(): ToneFeed` — the tone goes both to the host's speakers and to `track`.
  - Env vars (optional; default = PeerJS public broker): `VITE_PEER_HOST`, `VITE_PEER_PORT`, `VITE_PEER_PATH`, `VITE_PEER_SECURE`.

These adapters wrap browser-only APIs (WebRTC, WebAudio) that do not exist in Vitest's Node environment. They are covered by the Playwright game in Task 11, which must fail if they are wrong (no audio track on guests, no connection). That e2e test is their RED/GREEN gate.

- [ ] **Step 1: Install PeerJS**

```bash
npm install peerjs@1.5.5
```

- [ ] **Step 2: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEER_HOST?: string;
  readonly VITE_PEER_PORT?: string;
  readonly VITE_PEER_PATH?: string;
  readonly VITE_PEER_SECURE?: string;
}
```

- [ ] **Step 3: Write `src/net/peer.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/music/tone.ts`**

```ts
import type { ToneOutput } from './fake';

export interface ToneFeed {
  output: ToneOutput;
  /** The host's audio, streamed to guests. */
  track: MediaStreamTrack;
  context: AudioContext;
  close(): void;
}

export function createToneFeed(): ToneFeed {
  const context = new AudioContext();
  const gain = context.createGain();
  gain.gain.value = 0;
  const destination = context.createMediaStreamDestination();
  gain.connect(destination);
  gain.connect(context.destination);
  let osc: OscillatorNode | null = null;

  const output: ToneOutput = {
    start(frequency) {
      output.stop();
      osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      osc.connect(gain);
      osc.start();
      gain.gain.setTargetAtTime(0.15, context.currentTime, 0.05);
    },
    stop() {
      if (!osc) return;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      osc.stop(context.currentTime + 0.3);
      osc = null;
    },
  };

  return {
    output,
    track: destination.stream.getAudioTracks()[0],
    context,
    close: () => {
      void context.close();
    },
  };
}
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: clean; build succeeds (the adapters are not imported by the app yet, so the bundle is unchanged — that is fine).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/net/peer.ts src/music/tone.ts src/vite-env.d.ts
git commit -m "feat(net): PeerJS host/guest transports and WebAudio tone feed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: UI foundation — theme, router, text helpers, shared components, play panel

**Files:**
- Modify: `src/host/view.ts` (add `TurnView.seq`), `src/host/view.test.ts`
- Create: `src/ui/theme.css`, `src/ui/router.ts`, `src/ui/text.ts`, `src/ui/keys.ts`, `src/ui/components.tsx`, `src/ui/PlayPanel.tsx`
- Test: `src/ui/router.test.ts`, `src/ui/text.test.ts`

**Interfaces:**
- Consumes: `GameView`, `CardView` (view), `GuestIntent` (runtime), `AudioState` (protocol).
- Produces:
  - `TurnView.seq: string` — changes whenever a new track is in play for a turn (`${turnIndex}-${discard.length}`), used as a React key so inputs reset per track.
  - `type Route = { name: 'home' } | { name: 'host' } | { name: 'join'; code: string }`, `parseRoute(hash): Route`, `useRoute(): Route`, `joinUrl(code): string`
  - `slotLabel(cards: { year: number }[], slot: number): string`, `teamById(view, id): TeamView | undefined`, `revealHeadline(view): string`, `winnersHeadline(view): string`
  - `NAME_KEY`, `ROOM_KEY`, `HOST_ID_KEY`
  - Components: `Wordmark({ big? })`, `TokenChip({ count })`, `Scores({ view })`, `Disc({ size? })`, `NowPlaying({ label, audio })`, `Timeline({ cards, slots?, horizontal? })`, `type SlotProps = { state: 'free' | 'mine' | 'theirs' | 'taken'; note?: string; onPick?: () => void }`
  - `PlayPanel({ view, audio, stealWindowMs, error, act })`, `useCountdown(totalMs): number`

- [ ] **Step 1: Write the failing tests**

In `src/host/view.test.ts`, change the expectation in `'exposes the turn without the track'` to:
```ts
    expect(toView(g, meta, null).turn).toEqual({ teamId: 'B', slot: 1, steals: [], seq: '0-0' });
```
and add inside the `describe('toView', …)` block:
```ts
  it('changes the turn seq when a new track comes into play', () => {
    const g0 = newGame();
    const g1 = run(g0, { type: 'skip', teamId: 'B' });
    expect(toView(g0, meta, null).turn?.seq).not.toBe(toView(g1, meta, null).turn?.seq);
  });
```

`src/ui/router.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/host', { name: 'host' }],
    ['#/join/TUBE-7KQ3', { name: 'join', code: 'TUBE-7KQ3' }],
    ['#/join/tube-7kq3', { name: 'join', code: 'TUBE-7KQ3' }],
    ['#/join/<script>', { name: 'home' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });
});
```

`src/ui/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newGame, run, teamOf } from '../engine/testkit';
import type { GameState } from '../engine/types';
import { toView } from '../host/view';
import { revealHeadline, slotLabel, winnersHeadline } from './text';

const reveal = (g: GameState, viewer: string | null) => toView(g, {}, viewer);
const lockAndClose = (g: GameState, slot: number, steals: { teamId: string; slot: number }[] = []) =>
  run(
    g,
    { type: 'place', teamId: 'B', slot },
    { type: 'lockIn', teamId: 'B', nameCorrect: false },
    ...steals.map((s) => ({ type: 'steal' as const, ...s })),
    { type: 'closeSteals' },
  );

describe('slotLabel', () => {
  const cards = [{ year: 1977 }, { year: 1985 }];
  it.each([
    [0, 'Before 1977'],
    [1, 'Between 1977 and 1985'],
    [2, 'After 1985'],
  ])('slot %i → %s', (slot, label) => {
    expect(slotLabel(cards, slot)).toBe(label);
  });
});

describe('revealHeadline', () => {
  it('speaks to the team that kept the card', () => {
    const g = lockAndClose(newGame(), 1);
    expect(revealHeadline(reveal(g, 'B'))).toBe('You got it!');
    expect(revealHeadline(reveal(g, 'C'))).toBe('Cassette got it');
  });
  it('announces steals and misses', () => {
    const g0 = structuredClone(newGame());
    teamOf(g0, 'B').timeline = [
      { trackId: 'b1', year: 1977 },
      { trackId: 'x', year: 1991 },
    ];
    const stolen = lockAndClose(g0, 0, [{ teamId: 'C', slot: 2 }]);
    expect(revealHeadline(reveal(stolen, 'C'))).toBe('You stole it!');
    expect(revealHeadline(reveal(stolen, 'A'))).toBe('Mixtape stole it');
    expect(revealHeadline(reveal(lockAndClose(newGame(), 0), 'A'))).toBe('Nobody got it');
  });
});

describe('winnersHeadline', () => {
  it('congratulates the winner and tells the others', () => {
    const g = lockAndClose(newGame({ cardsToWin: 2 }), 1);
    expect(winnersHeadline(reveal(g, 'B'))).toBe('You win!');
    expect(winnersHeadline(reveal(g, 'A'))).toBe('Cassette wins!');
    expect(winnersHeadline(reveal(newGame(), 'A'))).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/host/view.test.ts src/ui`
Expected: FAIL — `seq` missing; `./router`, `./text` not found.

- [ ] **Step 3: Add `seq` to the view** — in `src/host/view.ts`:

Change `TurnView` to:
```ts
export interface TurnView {
  teamId: TeamId;
  slot: number | null;
  steals: Steal[];
  /** Changes whenever a new track comes into play (new turn, skip, failed track). */
  seq: string;
}
```
and the `turn:` field of `toView`'s return to:
```ts
    turn: state.turn
      ? {
          teamId: state.turn.teamId,
          slot: state.turn.slot,
          steals: state.turn.steals.map((s) => ({ ...s })),
          seq: `${state.turnIndex}-${state.discard.length}`,
        }
      : null,
```

- [ ] **Step 4: Write `src/ui/router.ts`, `src/ui/text.ts`, `src/ui/keys.ts`**

`src/ui/router.ts`:
```ts
import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'host' } | { name: 'join'; code: string };

export function parseRoute(hash: string): Route {
  const join = /^#\/join\/(TUBE-[A-Z0-9]{4})$/i.exec(hash);
  if (join) return { name: 'join', code: join[1].toUpperCase() };
  if (hash === '#/host') return { name: 'host' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function joinUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}#/join/${code}`;
}
```

`src/ui/text.ts`:
```ts
import type { GameView, TeamView } from '../host/view';

export function slotLabel(cards: { year: number }[], slot: number): string {
  if (cards.length === 0) return 'Anywhere';
  if (slot <= 0) return `Before ${cards[0].year}`;
  if (slot >= cards.length) return `After ${cards[cards.length - 1].year}`;
  return `Between ${cards[slot - 1].year} and ${cards[slot].year}`;
}

export function teamById(view: GameView, id: string | null | undefined): TeamView | undefined {
  return view.teams.find((t) => t.id === id);
}

export function revealHeadline(view: GameView): string {
  const outcome = view.reveal?.outcome;
  if (!outcome) return '';
  if (outcome.cardWonBy === null) return 'Nobody got it';
  const stolen = outcome.cardWonBy !== outcome.activeTeamId;
  if (outcome.cardWonBy === view.viewerTeamId) return stolen ? 'You stole it!' : 'You got it!';
  const name = teamById(view, outcome.cardWonBy)?.name ?? 'Someone';
  return stolen ? `${name} stole it` : `${name} got it`;
}

export function winnersHeadline(view: GameView): string {
  if (view.phase !== 'finished') return '';
  if (view.viewerTeamId && view.winnerIds.includes(view.viewerTeamId)) return 'You win!';
  const names = view.winnerIds.map((id) => teamById(view, id)?.name ?? id);
  return `${names.join(' & ')} ${names.length === 1 ? 'wins' : 'win'}!`;
}
```

`src/ui/keys.ts`:
```ts
export const NAME_KEY = 'tubester.name';
export const ROOM_KEY = 'tubester.room';
export const HOST_ID_KEY = 'tubester.hostId';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/host/view.test.ts src/ui`
Expected: PASS.

- [ ] **Step 6: Write `src/ui/theme.css`**

```css
:root {
  --bg: #0f1115;
  --surface: #1a1d24;
  --line: #2a2f3a;
  --line-strong: #3a4050;
  --text: #f2f0ea;
  --muted: #9aa0ac;
  --soft: #c9cdd4;
  --me: #ffd23f;
  --me-bg: #2a2614;
  --steal: #ff8a4c;
  --steal-bg: #2a1a12;
  --steal-text: #ffb48c;
  --other: #5ab0ff;
  --other-bg: #14202e;
  --other-text: #9fd0ff;
  --display: "Space Grotesk", system-ui, sans-serif;
  --body: Inter, system-ui, sans-serif;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--body); }
body { min-height: 100dvh; overflow-x: hidden; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.45; }
h1, h2 { font-family: var(--display); margin: 0; font-size: 17px; }
p { margin: 0; }
.screen { max-width: 480px; margin: 0 auto; padding: 14px 16px 24px; display: flex; flex-direction: column; gap: 14px; min-height: 100dvh; }
.screen.wide { max-width: 1232px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.wordmark { font-family: var(--display); font-weight: 700; font-size: 20px; letter-spacing: 0.5px; }
.wordmark span { color: var(--me); }
.wordmark.big { font-size: 40px; }
.muted { color: var(--muted); font-size: 13px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); font-size: 12px; color: var(--soft); }
.chip.me { background: var(--me); border-color: var(--me); color: var(--bg); font-weight: 600; }
.chip.live { background: var(--other-bg); border-color: transparent; color: var(--other-text); font-weight: 600; }
.scores { display: flex; gap: 6px; flex-wrap: wrap; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.panel.active { border: 2px solid var(--me); }
.rows { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 14px; }
.now { flex-direction: row; align-items: center; gap: 14px; }
.kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: var(--me); }
.kicker.steal { color: var(--steal); }
.headline { font-family: var(--display); font-size: 20px; font-weight: 700; }
.headline.big { font-size: 32px; text-align: center; }
.eq { display: flex; align-items: flex-end; gap: 3px; height: 18px; }
.eq i { width: 4px; height: 12px; background: var(--me); border-radius: 2px; animation: eq 0.9s ease-in-out infinite; }
.eq i:nth-child(2) { animation-delay: -0.3s; }
.eq i:nth-child(3) { animation-delay: -0.6s; }
.eq i:nth-child(4) { animation-delay: -0.15s; }
@keyframes eq { 0%, 100% { height: 5px; } 50% { height: 18px; } }
@media (prefers-reduced-motion: reduce) { .eq i { animation: none; } }
.timeline { display: flex; flex-direction: column; gap: 6px; }
.timeline.horizontal { flex-direction: row; align-items: stretch; overflow-x: auto; padding-bottom: 4px; }
.card { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); min-width: 0; }
.timeline.horizontal .card { flex: none; width: 112px; flex-direction: column; align-items: flex-start; gap: 4px; }
.card .year { font-family: var(--display); font-weight: 700; font-size: 22px; min-width: 56px; }
.card .meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.card .title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.timeline.horizontal .card .title { white-space: normal; font-size: 12px; }
.card .artist { font-size: 12px; color: var(--muted); }
.slot { min-height: 44px; width: 100%; padding: 8px; border-radius: 12px; border: 1.5px dashed var(--line-strong); background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; }
.slot:disabled { opacity: 1; cursor: default; }
.slot.mine { border: 2px solid var(--me); background: var(--me-bg); color: var(--me); font-weight: 600; }
.slot.theirs { border: 2px solid var(--other); background: var(--other-bg); color: var(--other-text); font-weight: 600; }
.slot.taken { border: 1.5px solid var(--line-strong); background: var(--surface); color: var(--soft); }
.stealing .slot.mine { border-color: var(--steal); background: var(--steal-bg); color: var(--steal-text); }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; color: var(--muted); }
.field.inline { flex-direction: row; align-items: center; justify-content: space-between; font-size: 14px; color: var(--soft); }
.input { height: 44px; min-width: 0; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); padding: 0 12px; font-size: 15px; }
.input.narrow { width: 80px; text-align: center; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.btn { min-height: 52px; padding: 0 16px; border-radius: 14px; border: 1px solid var(--line-strong); background: transparent; font-size: 15px; font-weight: 600; }
.btn.primary { flex: 1; border: none; background: var(--me); color: var(--bg); font-family: var(--display); font-size: 17px; font-weight: 700; }
.btn.small { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 500; }
.btn.tubester { width: 100%; min-height: 72px; border: none; border-radius: 18px; background: var(--steal); color: var(--bg); font-family: var(--display); font-size: 28px; font-weight: 700; letter-spacing: 1.5px; }
.sticky-bottom { position: sticky; bottom: 0; padding: 8px 0 4px; background: var(--bg); display: flex; flex-direction: column; gap: 8px; }
.countdown { width: 64px; height: 64px; flex: none; border-radius: 999px; border: 6px solid var(--steal); display: flex; align-items: center; justify-content: center; font-family: var(--display); font-size: 24px; font-weight: 700; }
.reveal { background: var(--me); color: var(--bg); border-radius: 20px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.reveal .kicker { color: var(--bg); }
.reveal .big-year { font-family: var(--display); font-size: 72px; font-weight: 700; line-height: 1; }
.reveal .song { font-family: var(--display); font-size: 22px; font-weight: 700; }
.error { color: var(--steal-text); font-size: 13px; }
.banner { width: 100%; min-height: 44px; border: none; border-radius: 12px; background: var(--steal); color: var(--bg); font-weight: 600; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 999px; background: var(--other); }
.dot.off { background: transparent; border: 1.5px solid var(--muted); }
.board { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.board > .main { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.board > .side { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.link-box { padding: 10px 12px; border-radius: 10px; background: var(--bg); border: 1px solid var(--line); font-size: 13px; color: var(--soft); overflow-wrap: anywhere; }
.hero { display: flex; flex-direction: column; align-items: center; gap: 14px; padding-top: 40px; text-align: center; }
```

- [ ] **Step 7: Write `src/ui/components.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { CardView, GameView } from '../host/view';
import type { AudioState } from '../net/protocol';
import { slotLabel, teamById } from './text';

export function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={big ? 'wordmark big' : 'wordmark'}>
      TUBE<span>STER</span>
    </span>
  );
}

export function TokenChip({ count }: { count: number }) {
  return (
    <span className="chip" role="img" aria-label={`${count} tokens`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
      <strong>{count}</strong>
    </span>
  );
}

export function Scores({ view }: { view: GameView }) {
  return (
    <div className="scores">
      {view.turnOrder.map((id) => {
        const team = teamById(view, id);
        if (!team) return null;
        return (
          <span key={id} className={id === view.viewerTeamId ? 'chip me' : 'chip'}>
            {team.name} {team.timeline.length}/{view.settings.cardsToWin}
          </span>
        );
      })}
    </div>
  );
}

export function Disc({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0B0C10" stroke="#2A2F3A" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#1E222B" strokeWidth="2" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#1E222B" strokeWidth="2" />
      <circle cx="32" cy="32" r="9" fill="#FFD23F" />
      <circle cx="32" cy="32" r="2" fill="#0B0C10" />
    </svg>
  );
}

export function NowPlaying({ label, audio }: { label: string; audio: AudioState }) {
  return (
    <div className="panel now">
      <Disc />
      <div className="rows">
        <span className="kicker">{label}</span>
        <strong className="headline">Mystery track</strong>
        {audio === 'playing' ? (
          <span className="eq" role="img" aria-label="Playing">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="muted">{audio === 'countdown' ? 'Get ready…' : 'Stopped'}</span>
        )}
      </div>
    </div>
  );
}

export type SlotState = 'free' | 'mine' | 'theirs' | 'taken';

export interface SlotProps {
  state: SlotState;
  note?: string;
  onPick?: () => void;
}

/** Oldest first. With `slots`, renders a gap button before, between and after the cards. */
export function Timeline({
  cards,
  slots,
  horizontal = false,
}: {
  cards: CardView[];
  slots?: SlotProps[];
  horizontal?: boolean;
}) {
  const items: ReactNode[] = [];
  for (let i = 0; i <= cards.length; i++) {
    const slot = slots?.[i];
    if (slot) {
      items.push(
        <button
          key={`slot-${i}`}
          type="button"
          className={`slot ${slot.state}`}
          disabled={!slot.onPick}
          aria-pressed={slot.state === 'mine'}
          onClick={slot.onPick}
        >
          {slotLabel(cards, i)}
          {slot.note ? ` · ${slot.note}` : ''}
        </button>,
      );
    }
    const card = cards[i];
    if (card) {
      items.push(
        <div key={card.trackId} className="card">
          <span className="year">{card.year}</span>
          <span className="meta">
            <span className="title">{card.title}</span>
            <span className="artist">{card.artists.join(', ')}</span>
          </span>
        </div>,
      );
    }
  }
  return <div className={horizontal ? 'timeline horizontal' : 'timeline'}>{items}</div>;
}
```

- [ ] **Step 8: Write `src/ui/PlayPanel.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { GuestIntent } from '../host/runtime';
import type { GameView } from '../host/view';
import type { AudioState } from '../net/protocol';
import { NowPlaying, Scores, type SlotProps, Timeline } from './components';
import { revealHeadline, teamById, winnersHeadline } from './text';

export interface PlayPanelProps {
  view: GameView;
  audio: AudioState;
  stealWindowMs: number;
  error: string | null;
  act: (intent: GuestIntent) => void;
}

/** Counts down from `totalMs` starting when the component mounts. */
export function useCountdown(totalMs: number): number {
  const [end] = useState(() => Date.now() + totalMs);
  const [left, setLeft] = useState(totalMs);
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end - Date.now())), 200);
    return () => clearInterval(id);
  }, [end]);
  return left;
}

/** Everything a player can see and do during a game; shared by guest phones and the host board. */
export function PlayPanel(props: PlayPanelProps) {
  const { view } = props;
  if (view.phase === 'finished') return <Finished view={view} />;
  if (view.phase === 'reveal') return <Reveal view={view} />;
  const turn = view.turn;
  if (!turn) return null;
  const mine = turn.teamId === view.viewerTeamId;
  if (mine && view.phase === 'deciding') return <MyTurn key={turn.seq} {...props} />;
  if (!mine && view.phase === 'stealWindow') return <Steal key={turn.seq} {...props} />;
  return <Watching {...props} />;
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

function MyTurn({ view, audio, error, act }: PlayPanelProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const team = teamById(view, view.viewerTeamId);
  const turn = view.turn;
  if (!team || !turn) return null;
  const slots: SlotProps[] = Array.from({ length: team.timeline.length + 1 }, (_, i) => ({
    state: i === turn.slot ? 'mine' : 'free',
    note: i === turn.slot ? 'your guess' : undefined,
    onPick: () => act({ type: 'place', slot: i }),
  }));
  const guess = title.trim() || artist.trim() ? { title, artist } : undefined;
  return (
    <section className="rows">
      <NowPlaying label={`Your turn · ${team.name}`} audio={audio} />
      <h2>Place it on your timeline</h2>
      <Timeline cards={team.timeline} slots={slots} />
      <span className="muted">Name it for +1 token (optional)</span>
      <div className="grid2">
        <label className="field">
          Title
          <input
            className="input"
            value={title}
            maxLength={200}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Artist
          <input
            className="input"
            value={artist}
            maxLength={200}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setArtist(e.target.value)}
          />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="actions sticky-bottom">
        <div className="actions">
          <button type="button" className="btn" disabled={team.tokens < 1} onClick={() => act({ type: 'skip' })}>
            Skip · 1 token
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={turn.slot === null}
            onClick={() => act({ type: 'lockIn', guess })}
          >
            Lock in
          </button>
        </div>
      </div>
    </section>
  );
}

function Steal({ view, stealWindowMs, error, act }: PlayPanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const left = useCountdown(stealWindowMs);
  const turn = view.turn;
  const active = teamById(view, turn?.teamId);
  const me = teamById(view, view.viewerTeamId);
  if (!turn || !active || !me) return null;
  const myClaim = turn.steals.find((s) => s.teamId === me.id);
  const slots: SlotProps[] = Array.from({ length: active.timeline.length + 1 }, (_, i): SlotProps => {
    if (i === turn.slot) return { state: 'theirs', note: `${active.name}'s pick` };
    const claim = turn.steals.find((s) => s.slot === i);
    if (claim) {
      return claim.teamId === me.id
        ? { state: 'mine', note: 'your steal' }
        : { state: 'taken', note: teamById(view, claim.teamId)?.name };
    }
    if (myClaim || left === 0) return { state: 'free' };
    return { state: i === picked ? 'mine' : 'free', onPick: () => setPicked(i) };
  });
  const canPress = picked !== null && !myClaim && me.tokens >= 1 && left > 0;
  const seconds = Math.ceil(left / 1000);
  return (
    <section className="rows stealing">
      <div className="panel now">
        <span className="countdown" role="timer" aria-label={`${seconds} seconds left`}>
          {seconds}
        </span>
        <div className="rows">
          <span className="kicker steal">Steal window</span>
          <span>{active.name} locked in. Think they're wrong?</span>
        </div>
      </div>
      <h2>{active.name}'s timeline</h2>
      <Timeline cards={active.timeline} slots={slots} />
      <ErrorLine error={error} />
      <div className="sticky-bottom">
        <span className="muted">
          {myClaim ? 'Steal placed. Fingers crossed!' : 'Pick a slot, then press. Costs 1 token.'}
        </span>
        <button
          type="button"
          className="btn tubester"
          disabled={!canPress}
          onClick={() => {
            if (picked !== null) act({ type: 'steal', slot: picked });
          }}
        >
          TUBESTER!
        </button>
      </div>
      <BuyButton view={view} act={act} />
    </section>
  );
}

function Watching({ view, audio, act }: PlayPanelProps) {
  const turn = view.turn;
  const active = teamById(view, turn?.teamId);
  if (!turn || !active) return null;
  const slots: SlotProps[] | undefined =
    turn.slot === null
      ? undefined
      : Array.from({ length: active.timeline.length + 1 }, (_, i) => ({ state: i === turn.slot ? 'theirs' : 'free' }));
  const label = view.phase === 'stealWindow' ? `${active.name} locked in` : `${active.name} is placing…`;
  return (
    <section className="rows">
      <NowPlaying label={label} audio={audio} />
      <h2>{active.name}'s timeline</h2>
      <Timeline cards={active.timeline} slots={slots} />
      <BuyButton view={view} act={act} />
    </section>
  );
}

function BuyButton({ view, act }: Pick<PlayPanelProps, 'view' | 'act'>) {
  const me = teamById(view, view.viewerTeamId);
  if (!me || view.turn?.teamId === me.id) return null;
  const cost = view.settings.buyCost;
  return (
    <button type="button" className="btn small" disabled={me.tokens < cost} onClick={() => act({ type: 'buy' })}>
      Buy a card · {cost} tokens
    </button>
  );
}

function Reveal({ view }: { view: GameView }) {
  const r = view.reveal;
  if (!r) return null;
  const active = teamById(view, r.outcome.activeTeamId);
  return (
    <section className="rows">
      <div className="reveal">
        <span className="kicker">It was</span>
        <span className="big-year">{r.year}</span>
        <span className="song">{r.title}</span>
        <span>{r.artists.join(', ')}</span>
      </div>
      <p className="headline">{revealHeadline(view)}</p>
      {r.outcome.nameBonus && <p className="muted">{active?.name ?? 'They'} named it: +1 token</p>}
    </section>
  );
}

function Finished({ view }: { view: GameView }) {
  return (
    <section className="rows">
      <p className="headline big">{winnersHeadline(view)}</p>
      <Reveal view={view} />
      <Scores view={view} />
    </section>
  );
}
```

- [ ] **Step 9: Run tests, typecheck, lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS, clean.

- [ ] **Step 10: Commit**

```bash
git add src/host/view.ts src/host/view.test.ts src/ui
git commit -m "feat(ui): theme, router, text helpers, timeline components and play panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Home and guest screens

**Files:**
- Create: `src/ui/Home.tsx`, `src/ui/GuestApp.tsx`, `public/manifest.webmanifest`, `public/icon.svg`
- Modify: `src/App.tsx`, `src/main.tsx`, `index.html`

**Interfaces:**
- Consumes: Task 6 `GuestSession`, `loadIdentity`, `GuestSnapshot`; Task 7 `createGuestTransport`; Task 8 components, `PlayPanel`, `useRoute`, keys; `teamNameOf` (Task 3).
- Produces: routes `#/` (Home), `#/join/TUBE-XXXX` (GuestApp). `#/host` is wired to `HostApp` in Task 10; until then App renders Home for it.

UI is exercised by the Playwright game in Task 11 (RED/GREEN gate for screens); the logic it renders is unit-tested in Tasks 2–8.

- [ ] **Step 1: Write `src/ui/Home.tsx`**

```tsx
import { type FormEvent, useState } from 'react';
import { Disc, Wordmark } from './components';
import { NAME_KEY } from './keys';

export function Home() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  function create(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    window.location.hash = '#/host';
  }
  return (
    <main className="screen">
      <form className="rows" onSubmit={create}>
        <div className="hero">
          <Disc size={112} />
          <Wordmark big />
          <p className="muted">A music timeline party game. Host on this computer, friends join from their phones.</p>
        </div>
        <label className="field">
          Your name
          <input
            className="input"
            value={name}
            maxLength={24}
            required
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn primary">
          Create room
        </button>
        <p className="muted">Demo mode plays test tones instead of real songs. Spotify comes next.</p>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Write `src/ui/GuestApp.tsx`**

```tsx
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { GuestSession, type GuestSnapshot, loadIdentity } from '../guest/session';
import type { GuestIntent } from '../host/runtime';
import { teamNameOf } from '../host/lobby';
import { createGuestTransport } from '../net/peer';
import { Disc, Scores, TokenChip, Wordmark } from './components';
import { NAME_KEY } from './keys';
import { PlayPanel } from './PlayPanel';
import { teamById } from './text';

export function GuestApp({ code }: { code: string }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const sessionRef = useRef<GuestSession | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => sessionRef.current?.dispose(), []);

  const stream = snap?.stream ?? null;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream || audio.srcObject === stream) return;
    audio.srcObject = stream;
    audio.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    );
  }, [stream]);

  function join(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || sessionRef.current) return;
    localStorage.setItem(NAME_KEY, n);
    // Unlock audio playback and keep the screen on while we still have the user's tap.
    audioRef.current?.play().catch(() => undefined);
    navigator.wakeLock?.request('screen').catch(() => undefined);
    sessionRef.current = new GuestSession({
      transport: createGuestTransport(code),
      identity: loadIdentity(localStorage),
      name: n,
      onUpdate: setSnap,
    });
  }

  function enableSound() {
    audioRef.current?.play().then(
      () => setNeedsTap(false),
      () => undefined,
    );
  }

  const act = (intent: GuestIntent) => sessionRef.current?.act(intent);

  return (
    <main className="screen">
      <audio ref={audioRef} autoPlay playsInline>
        <track kind="captions" />
      </audio>
      {needsTap && (
        <button type="button" className="banner" onClick={enableSound}>
          Tap to enable sound
        </button>
      )}
      {!snap && <JoinForm code={code} name={name} setName={setName} onJoin={join} />}
      {snap && !snap.view && <GuestLobby snap={snap} />}
      {snap?.view && <GuestGame snap={snap} act={act} />}
    </main>
  );
}

function JoinForm({
  code,
  name,
  setName,
  onJoin,
}: {
  code: string;
  name: string;
  setName: (n: string) => void;
  onJoin: (e: FormEvent) => void;
}) {
  return (
    <form className="rows" onSubmit={onJoin}>
      <div className="hero">
        <Disc size={112} />
        <Wordmark big />
        <p className="muted">Hear the song. Guess when it came out. Build your timeline first.</p>
      </div>
      <div className="panel">
        <span className="muted">Joining room</span>
        <strong className="headline">{code}</strong>
      </div>
      <label className="field">
        Your name
        <input
          className="input"
          value={name}
          maxLength={24}
          required
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="muted">Turn your sound on. Music plays on your phone, no account needed.</p>
      <button type="submit" className="btn primary">
        Join game
      </button>
    </form>
  );
}

function GuestLobby({ snap }: { snap: GuestSnapshot }) {
  return (
    <section className="rows">
      <header className="topbar">
        <Wordmark />
      </header>
      <p className="headline">{snap.status === 'open' && snap.lobby ? "You're in!" : 'Connecting…'}</p>
      {snap.error && (
        <p className="error" role="alert">
          {snap.error}
        </p>
      )}
      {snap.lobby && (
        <div className="panel rows">
          {snap.lobby.players.map((p) => (
            <div key={p.id} className="row">
              <span>
                <span className={p.connected ? 'dot' : 'dot off'} />
                {p.name}
                {p.isHost ? ' · host' : ''}
                {p.id === snap.playerId ? ' (you)' : ''}
              </span>
              <span className="muted">{teamNameOf(p.teamId)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="muted">Waiting for the host to start…</p>
    </section>
  );
}

function GuestGame({ snap, act }: { snap: GuestSnapshot; act: (i: GuestIntent) => void }) {
  const view = snap.view;
  if (!view) return null;
  const me = teamById(view, view.viewerTeamId);
  return (
    <>
      <header className="topbar">
        <Wordmark />
        {me && <TokenChip count={me.tokens} />}
      </header>
      {snap.status !== 'open' && (
        <p className="error" role="status">
          Reconnecting…
        </p>
      )}
      <Scores view={view} />
      <PlayPanel view={view} audio={snap.audio} stealWindowMs={snap.stealWindowMs} error={snap.error} act={act} />
    </>
  );
}
```

- [ ] **Step 3: Wire routes and styles**

`src/App.tsx`:
```tsx
import { GuestApp } from './ui/GuestApp';
import { Home } from './ui/Home';
import { useRoute } from './ui/router';

export function App() {
  const route = useRoute();
  if (route.name === 'join') return <GuestApp key={route.code} code={route.code} />;
  return <Home />;
}
```

`src/main.tsx` (StrictMode removed: its double-mounted effects would open two PeerJS peers fighting for the same room id):
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/theme.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0F1115" />
    <title>TUBESTER</title>
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="icon" href="icon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/manifest.webmanifest`:
```json
{
  "name": "TUBESTER",
  "short_name": "TUBESTER",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0F1115",
  "theme_color": "#0F1115",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0F1115"/><circle cx="32" cy="32" r="24" fill="#0B0C10" stroke="#2A2F3A" stroke-width="2"/><circle cx="32" cy="32" r="17" fill="none" stroke="#1E222B" stroke-width="2"/><circle cx="32" cy="32" r="8" fill="#FFD23F"/><circle cx="32" cy="32" r="2" fill="#0B0C10"/></svg>
```

- [ ] **Step 4: Typecheck, lint, unit tests, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: clean; build succeeds. If Biome flags `noNonNullAssertion` on `document.getElementById('root')!` it was already present in Plan 1; keep it and follow Task 1's rule for existing idioms.

- [ ] **Step 5: Commit**

```bash
git add index.html public src/App.tsx src/main.tsx src/ui/Home.tsx src/ui/GuestApp.tsx
git commit -m "feat(ui): home and guest screens (join, lobby, game)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Host screens

**Files:**
- Create: `src/ui/HostApp.tsx`, `src/ui/HostLobby.tsx`, `src/ui/HostBoard.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 `HostSession`, `HostSnapshot`; Task 4 `FakeMusicSource`, `DEMO_TRACKS`; Task 7 `createHostTransport`, `createToneFeed`; Task 2 `newRoomCode`, `browserTimer`; Task 3 `TEAMS`, `MAX_PLAYERS`, `canStart`, `teamNameOf`; Task 8 components, `PlayPanel`, `joinUrl`, keys.
- Produces: route `#/host`. Test hooks used by Task 11: invite link has `data-testid="invite-link"`; team selects are labelled `Team for <name>`; settings inputs are labelled `Cards to win`, `Starting tokens`, `Steal window (s)`; buttons `Start game`, `Pass turn`, `Next`, `New game`.

- [ ] **Step 1: Write `src/ui/HostLobby.tsx`**

```tsx
import { useState } from 'react';
import { canStart, MAX_PLAYERS, TEAMS } from '../host/lobby';
import type { HostSession, HostSnapshot } from '../host/session';
import { DEMO_TRACKS } from '../music/demo';
import { Wordmark } from './components';
import { joinUrl } from './router';

export function HostLobby({
  code,
  snap,
  session,
  onClose,
}: {
  code: string;
  snap: HostSnapshot;
  session: HostSession;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { lobby } = snap;
  const link = joinUrl(code);
  const ready = canStart(lobby);

  function start() {
    const r = session.startGame(DEMO_TRACKS);
    setError(r.ok ? null : r.reason);
  }

  return (
    <>
      <header className="topbar">
        <span>
          <Wordmark /> <span className="muted">Room {code}</span>
        </span>
        <button type="button" className="btn small" onClick={onClose}>
          Close room
        </button>
      </header>
      <div className="board">
        <section className="main panel">
          <h2>
            Players ({lobby.players.length}/{MAX_PLAYERS})
          </h2>
          <div className="rows">
            {lobby.players.map((p) => (
              <div key={p.id} className="row">
                <span>
                  <span className={p.connected ? 'dot' : 'dot off'} />
                  {p.name}
                  {p.isHost ? ' · host' : ''}
                </span>
                <select
                  className="input"
                  aria-label={`Team for ${p.name}`}
                  value={p.teamId}
                  onChange={(e) => session.assignTeam(p.id, e.target.value)}
                >
                  {TEAMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="muted">Everyone plays solo by default. Put players on the same team to share a timeline.</p>
        </section>
        <div className="side">
          <section className="panel">
            <h2>Invite</h2>
            <div className="link-box" data-testid="invite-link">
              {link}
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => navigator.clipboard?.writeText(link).catch(() => undefined)}
            >
              Copy link
            </button>
          </section>
          <section className="panel">
            <h2>Rules</h2>
            <NumberSetting
              label="Cards to win"
              value={lobby.settings.cardsToWin}
              onCommit={(v) => session.updateSettings({ cardsToWin: v })}
            />
            <NumberSetting
              label="Starting tokens"
              value={lobby.settings.startingTokens}
              onCommit={(v) => session.updateSettings({ startingTokens: v })}
            />
            <NumberSetting
              label="Steal window (s)"
              value={lobby.settings.stealWindowSec}
              onCommit={(v) => session.updateSettings({ stealWindowSec: v })}
            />
          </section>
          <section className="panel">
            <h2>Music</h2>
            <p className="muted">Demo hits · {DEMO_TRACKS.length} songs, played as test tones.</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn primary" disabled={!ready} onClick={start}>
              Start game
            </button>
            {!ready && <p className="muted">Need at least 2 teams.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

/** Commits on blur so typing "12" doesn't clamp at "1". `key` resets the field after clamping. */
function NumberSetting({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="field inline">
      {label}
      <input
        key={value}
        className="input narrow"
        type="number"
        inputMode="numeric"
        defaultValue={value}
        onBlur={(e) => onCommit(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </label>
  );
}
```

- [ ] **Step 2: Write `src/ui/HostBoard.tsx`**

```tsx
import { useState } from 'react';
import { teamNameOf } from '../host/lobby';
import type { GuestIntent } from '../host/runtime';
import type { HostSession, HostSnapshot } from '../host/session';
import { Timeline, Wordmark } from './components';
import { PlayPanel } from './PlayPanel';
import { teamById } from './text';

export function HostBoard({
  code,
  snap,
  session,
}: {
  code: string;
  snap: HostSnapshot;
  session: HostSession;
}) {
  const [error, setError] = useState<string | null>(null);
  const view = snap.view;
  if (!view) return null;
  const players = snap.lobby.players;
  const online = players.filter((p) => !p.isHost && p.connected).length;
  const act = (intent: GuestIntent) => {
    const r = session.act(intent);
    setError(r.ok ? null : r.reason);
  };

  return (
    <>
      <header className="topbar">
        <span>
          <Wordmark /> <span className="muted">Room {code} · {view.deckRemaining} songs left</span>
        </span>
        <span className="actions">
          <span className="chip live">
            Broadcasting to {online} {online === 1 ? 'player' : 'players'}
          </span>
          {view.phase === 'deciding' && (
            <button type="button" className="btn small" onClick={() => session.command({ type: 'passTurn' })}>
              Pass turn
            </button>
          )}
          {view.phase === 'reveal' && (
            <button type="button" className="btn small" onClick={() => session.command({ type: 'nextTurn' })}>
              Next
            </button>
          )}
          {view.phase === 'finished' && (
            <button type="button" className="btn small" onClick={() => session.reset()}>
              New game
            </button>
          )}
        </span>
      </header>
      <div className="board">
        <div className="main">
          {view.turnOrder.map((id) => {
            const team = teamById(view, id);
            if (!team) return null;
            const members = players.filter((p) => p.teamId === id).map((p) => p.name);
            return (
              <section key={id} className={view.turn?.teamId === id ? 'panel active' : 'panel'}>
                <div className="row">
                  <span className="headline">{team.name}</span>
                  <span className="muted">
                    {members.join(', ')} · {team.timeline.length}/{view.settings.cardsToWin} · {team.tokens} tokens
                  </span>
                </div>
                <Timeline cards={team.timeline} horizontal />
              </section>
            );
          })}
        </div>
        <div className="side">
          <PlayPanel
            view={view}
            audio={snap.audio}
            stealWindowMs={snap.lobby.settings.stealWindowSec * 1000}
            error={error}
            act={act}
          />
          <section className="panel rows">
            <h2>Players</h2>
            {players.map((p) => (
              <div key={p.id} className="row">
                <span>
                  <span className={p.connected ? 'dot' : 'dot off'} />
                  {p.name}
                  {p.isHost ? ' · host' : p.connected ? '' : ' · reconnecting…'}
                </span>
                <span className="muted">{teamNameOf(p.teamId)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Write `src/ui/HostApp.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { HostSession, type HostSnapshot } from '../host/session';
import { FakeMusicSource } from '../music/fake';
import { createToneFeed, type ToneFeed } from '../music/tone';
import { createHostTransport } from '../net/peer';
import { newRoomCode } from '../net/room';
import { browserTimer } from '../util/timer';
import { Wordmark } from './components';
import { HostBoard } from './HostBoard';
import { HostLobby } from './HostLobby';
import { HOST_ID_KEY, NAME_KEY, ROOM_KEY } from './keys';

function hostId(): string {
  let id = localStorage.getItem(HOST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(HOST_ID_KEY, id);
  }
  return id;
}

export function HostApp() {
  const [code] = useState(() => {
    const c = localStorage.getItem(ROOM_KEY) ?? newRoomCode();
    localStorage.setItem(ROOM_KEY, c);
    return c;
  });
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [status, setStatus] = useState<'opening' | 'ready' | 'error'>('opening');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const sessionRef = useRef<HostSession | null>(null);
  const feedRef = useRef<ToneFeed | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => undefined as void;
    const feed = createToneFeed();
    feedRef.current = feed;
    setSoundBlocked(feed.context.state === 'suspended');
    createHostTransport(code).then(
      (transport) => {
        if (cancelled) {
          transport.close();
          return;
        }
        transport.setAudioTrack(feed.track);
        const session = new HostSession({
          transport,
          music: new FakeMusicSource(feed.output),
          host: { id: hostId(), name: localStorage.getItem(NAME_KEY) || 'Host' },
          setTimer: browserTimer,
          storage: localStorage,
          onUpdate: setSnap,
        });
        sessionRef.current = session;
        setSnap(session.snapshot());
        setStatus('ready');
        cleanup = () => {
          session.dispose();
          transport.close();
        };
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
      cleanup();
      feed.close();
    };
  }, [code]);

  function closeRoom() {
    sessionRef.current?.reset();
    localStorage.removeItem(ROOM_KEY);
    window.location.hash = '#/';
    window.location.reload();
  }

  function enableSound() {
    feedRef.current?.context.resume().then(
      () => setSoundBlocked(false),
      () => undefined,
    );
  }

  const session = sessionRef.current;
  return (
    <main className="screen wide">
      {soundBlocked && (
        <button type="button" className="banner" onClick={enableSound}>
          Enable sound
        </button>
      )}
      {status === 'opening' && (
        <>
          <Wordmark />
          <p className="muted">Opening room {code}…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <Wordmark />
          <p className="error" role="alert">
            Couldn't open the room. Check your connection and reload.
          </p>
        </>
      )}
      {status === 'ready' && session && snap && snap.view && <HostBoard code={code} snap={snap} session={session} />}
      {status === 'ready' && session && snap && !snap.view && (
        <HostLobby code={code} snap={snap} session={session} onClose={closeRoom} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Route `#/host`** — `src/App.tsx`:

```tsx
import { GuestApp } from './ui/GuestApp';
import { HostApp } from './ui/HostApp';
import { Home } from './ui/Home';
import { useRoute } from './ui/router';

export function App() {
  const route = useRoute();
  if (route.name === 'host') return <HostApp />;
  if (route.name === 'join') return <GuestApp key={route.code} code={route.code} />;
  return <Home />;
}
```

- [ ] **Step 5: Typecheck, lint, unit tests, build**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/ui/HostApp.tsx src/ui/HostLobby.tsx src/ui/HostBoard.tsx
git commit -m "feat(ui): host lobby and game board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end game with Playwright

**Files:**
- Create: `playwright.config.ts`, `e2e/game.spec.ts`
- Modify: `vite.config.ts` (Vitest include), `tsconfig.json` (include e2e), `.gitignore`, `package.json` (script), `.github/workflows/ci.yml` (e2e job)

**Interfaces:**
- Consumes: everything above, through the browser.
- Produces: `npm run e2e`; CI job `e2e`.

- [ ] **Step 1: Install Playwright and the local signaling server**

```bash
npm install -D @playwright/test@1.64.1 peer@1.0.2
npx playwright install chromium
npx peerjs --help
```
Expected: the last command prints the PeerServer CLI usage (options include `--port` and `--path`). If the bin is not named `peerjs`, use the name `npm ls peer --parseable` + `cat node_modules/peer/package.json | grep -A3 '"bin"'` reports, and ledger a ruling.

- [ ] **Step 2: Keep Vitest away from Playwright specs and typecheck them** —

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/tubester/',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
```

In `tsconfig.json`, change `"include"` to `["src", "e2e", "vite.config.ts", "playwright.config.ts"]`.

Append to `.gitignore`:
```
test-results
playwright-report
```

In `package.json` `scripts`, add `"e2e": "playwright test"`.

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173/tubester/',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx peerjs --port 9000 --path /peer',
      port: 9000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173/tubester/',
      reuseExistingServer: !process.env.CI,
      env: { VITE_PEER_HOST: '127.0.0.1', VITE_PEER_PORT: '9000', VITE_PEER_PATH: '/peer', VITE_PEER_SECURE: 'false' },
    },
  ],
});
```

- [ ] **Step 4: Write the failing-if-broken e2e test** — `e2e/game.spec.ts`

```ts
import { type Browser, devices, expect, type Page, test } from '@playwright/test';

const PHONE = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const WIN = /\bwins?!$/;

async function openHost(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto('./#/');
  await page.getByLabel('Your name').fill('Hervé');
  await page.getByRole('button', { name: 'Create room' }).click();
  const link = (await page.getByTestId('invite-link').textContent({ timeout: 30_000 })) ?? '';
  expect(link).toMatch(/#\/join\/TUBE-[A-Z0-9]{4}$/);
  return { page, link };
}

async function joinGuest(browser: Browser, link: string, name: string, phone: boolean) {
  const ctx = await browser.newContext(phone ? PHONE : { ...devices['Desktop Chrome'] });
  const page = await ctx.newPage();
  await page.goto(link);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 30_000 });
  return page;
}

const hasAudio = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('audio')?.srcObject;
    return s instanceof MediaStream && s.getAudioTracks().length > 0;
  });

const sideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function setNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label);
  await input.fill(value);
  await input.press('Tab');
  await expect(page.getByLabel(label)).toHaveValue(value);
}

test('three players play a short game to the end', async ({ browser }) => {
  const host = await openHost(browser);
  const lea = await joinGuest(browser, host.link, 'Léa', true);
  const marco = await joinGuest(browser, host.link, 'Marco', false);
  await expect(host.page.getByLabel('Team for Marco')).toBeVisible();
  await setNumber(host.page, 'Cards to win', '2');
  await setNumber(host.page, 'Steal window (s)', '2');
  await host.page.getByRole('button', { name: 'Start game' }).click();

  const pages = [host.page, lea, marco];
  for (const p of pages) await expect(p.getByText('Mystery track').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => hasAudio(lea), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => hasAudio(marco), { timeout: 20_000 }).toBe(true);
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);

  let sawReveal = false;
  for (let i = 0; i < 40; i++) {
    if (await host.page.getByText(WIN).isVisible()) break;
    let player: Page | undefined;
    for (const p of pages) if (await p.getByRole('button', { name: 'Lock in' }).isVisible()) player = p;
    if (!player) {
      await host.page.waitForTimeout(300);
      continue;
    }
    await player.getByRole('button', { name: /^(Before|Between|After)/ }).first().click();
    await player.getByRole('button', { name: 'Lock in' }).click();
    const next = host.page.getByRole('button', { name: /^(Next|New game)$/ });
    await expect(next).toBeVisible({ timeout: 15_000 });
    if ((await next.textContent()) === 'Next') {
      await expect(lea.getByText('It was')).toBeVisible();
      sawReveal = true;
      await next.click();
    }
  }

  for (const p of pages) await expect(p.getByText(WIN)).toBeVisible({ timeout: 15_000 });
  expect(await sideScroll(lea)).toBeLessThanOrEqual(0);
  expect(sawReveal || (await lea.getByText('It was').isVisible())).toBe(true);
});

test('a guest gets the game back after the host reloads', async ({ browser }) => {
  const host = await openHost(browser);
  const lea = await joinGuest(browser, host.link, 'Léa', true);
  await host.page.getByRole('button', { name: 'Start game' }).click();
  await expect(lea.getByText('Mystery track').first()).toBeVisible({ timeout: 15_000 });
  const scores = await lea.locator('.scores').textContent();

  await host.page.reload();

  await expect(host.page.getByText('Broadcasting to 1 player')).toBeVisible({ timeout: 60_000 });
  await expect(lea.getByText('Reconnecting…')).toBeHidden({ timeout: 60_000 });
  await expect(lea.locator('.scores')).toHaveText(scores ?? '');
  await expect.poll(() => hasAudio(lea), { timeout: 30_000 }).toBe(true);
});
```

- [ ] **Step 5: Run the e2e suite**

Run: `npm run e2e`
Expected: 2 passed. A failure here is a real defect in Tasks 5–10 (or a PeerJS behaviour the adapters assumed wrongly): debug with `npx playwright show-trace test-results/**/trace.zip` under superpowers:systematic-debugging; fix the code, not the test's intent.

- [ ] **Step 6: Add the CI job** — append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces
          path: test-results
```

- [ ] **Step 7: Full verification, commit, push**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: everything passes.

```bash
git add -A
git commit -m "test(e2e): three-browser game and host reload over a local PeerJS server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/playable
```

Expected: both CI jobs (`test`, `e2e`) pass on the pushed branch (`GH_TOKEN=$(gh auth token -u k3rmitt) gh run list --branch feat/playable --limit 1`).
