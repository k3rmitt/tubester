# TUBESTER Core (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the TUBESTER web app and build its pure, fully unit-tested core: the rules engine, the fuzzy title/artist matcher, the MusicBrainz year resolver, and the host runtime (intent handling, timers, filtered views, persistence).

**Architecture:** Everything in this plan is side-effect-free TypeScript or takes its side effects (fetch, timers, storage) as injected functions, so it is testable in Node with Vitest. The engine is a reducer: `apply(state, action) → { ok, state } | { ok: false, reason }`. The host runtime wraps the engine, maps players to teams, computes the naming bonus with the matcher, runs the steal-window and reveal timers, and produces per-viewer views that never leak the current track before the reveal. Networking, UI, Spotify and broadcast come in Plans 2 and 3.

**Tech Stack:** TypeScript (strict), Vite, React (placeholder app only in this plan), Vitest, idb-keyval, GitHub Actions. Node ≥ 20 (uses `structuredClone`); local machine has Node 24.

**Spec:** `docs/superpowers/specs/2026-11-01-tubester-design.md`

**Later plans (not in scope here):**
- Plan 2 — Playable game: `net/` (PeerJS host/guest, messages, reconnect), `ui/` screens per mockups, `music/fake` source + oscillator audio, Playwright e2e (1 host + 2 guests, mobile viewports).
- Plan 3 — Real music & ship: `music/spotify` (PKCE, playlists, Web Playback SDK), `host/broadcast` (tab capture), year-review screen wired to `years/`, GitHub Pages deploy workflow, manual test checklist.

## Global Constraints

- Brand is **TUBESTER**; the steal action is **"TUBESTER!"**. The word "Hitster" must never appear in code, UI strings, or identifiers.
- Defaults: cards to win **10**, starting tokens **2**, token cap **5**, buy cost **3**, steal window **5 s**.
- Group size: 2–8 devices; solo or teams. The engine requires **≥ 2 teams**.
- A slot is correct if `left.year ≤ year ≤ right.year` (equal years valid on either side).
- Steal order = arrival order of the TUBESTER! press at the host; a player selects a slot first, then presses TUBESTER!.
- Before the reveal, the current track's `title`, `artists`, `year` **and `trackId`** never appear in any view.
- The name guess travels with `lockIn` (`lockIn{guess?:{title,artist}}`); the bonus needs **both** title and artist to match.
- Git: never commit on `main`; work on branch `feat/core-engine`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repo-local git identity is already `Hervé Bourzeix <herve.bourzeix@gmail.com>` and pushes as `k3rmitt`; do not change git config.

## Review Focus

1. **Same-year double-correct slots during a steal** — when the active team is correct and a stealer picked another slot that is *also* correct (equal years), the active team keeps the card and the stealer just loses the token. Test in Task 5.
2. **A deck track with no resolved year** — `createGame` must fail loudly (`no year for <id>`), never deal a card with `year: undefined`. Test in Task 3.
3. **Deck runs out mid-turn (skip / track failure / next turn)** — the game ends and the longest timeline(s) win, ties shared; it must never hang with `turn: null` in `deciding`. Tests in Tasks 4 and 6.
4. **Malformed slots from a guest** (`1.5`, `-1`, `NaN`, past the end) — rejected with `invalid slot`, state unchanged. Tests in Tasks 4 and 5.
5. **Host reloads during the steal window** — the restored runtime must re-arm the steal timer so the turn still reveals. Test in Task 10.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
.github/workflows/ci.yml          typecheck + unit tests + build on push/PR
src/main.tsx, src/App.tsx         placeholder app shell
src/engine/types.ts               engine data types, DEFAULT_SETTINGS, Action, Result
src/engine/timeline.ts            isValidSlot, isCorrectSlot, insertCard
src/engine/game.ts                createGame, apply (reducer) + internal helpers
src/engine/testkit.ts             shared test fixture (teams, deck, years, run helpers)
src/engine/*.test.ts              engine tests, one file per task
src/match/match.ts                normalize, levenshtein, similar, matchesGuess
src/music/types.ts                Track, PlaylistSummary, MusicSource interface (no impl)
src/years/musicbrainz.ts          lookupEarliestYear(isrc, fetch)
src/years/rateLimit.ts            createRateLimiter(intervalMs, sleep, now)
src/years/cache.ts                YearCache, memoryYearCache, idbYearCache
src/years/resolve.ts              resolveYears(tracks, deps) → ResolvedTrack[]
src/host/view.ts                  GameView types + toView(state, meta, viewerTeamId)
src/host/runtime.ts               HostRuntime class
```

---

### Task 1: Project scaffold and CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/sanity.test.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `typecheck`, `test`; Vite `base: '/tubester/'`; Vitest in `node` environment.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/herve.bourzeix/dev/perso/tubester
git fetch origin
git checkout -b feat/core-engine origin/design/initial-spec
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "tubester",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install react react-dom idb-keyval
npm install -D typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom
```

Expected: `package-lock.json` created, no errors.

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/tubester/',
  plugins: [react()],
  test: { environment: 'node' },
});
```

- [ ] **Step 6: Write `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TUBESTER</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export function App() {
  return <h1>TUBESTER</h1>;
}
```

`.gitignore`:
```
node_modules
dist
```

- [ ] **Step 7: Write a sanity test** — `src/sanity.test.ts`

```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests with structuredClone available', () => {
    expect(structuredClone({ a: [1] })).toEqual({ a: [1] });
  });
});
```

- [ ] **Step 8: Verify everything runs**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, `1 passed`, `dist/` produced.

- [ ] **Step 9: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches-ignore: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: scaffold Vite + React + Vitest app with CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Engine types and timeline helpers

**Files:**
- Create: `src/engine/types.ts`, `src/engine/timeline.ts`
- Test: `src/engine/timeline.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - types `TrackId`, `TeamId`, `Card`, `Team`, `Settings`, `Phase`, `Steal`, `Turn`, `Outcome`, `GameState`, `Action`, `Result`, const `DEFAULT_SETTINGS`
  - `isValidSlot(timeline: Card[], slot: number): boolean`
  - `isCorrectSlot(timeline: Card[], slot: number, year: number): boolean`
  - `insertCard(timeline: Card[], card: Card): Card[]` (returns a new sorted array)

- [ ] **Step 1: Write `src/engine/types.ts`**

```ts
export type TrackId = string;
export type TeamId = string;

export interface Card {
  trackId: TrackId;
  year: number;
}

export interface Team {
  id: TeamId;
  name: string;
  playerIds: string[];
  /** Sorted oldest → newest. */
  timeline: Card[];
  tokens: number;
}

export interface Settings {
  cardsToWin: number;
  startingTokens: number;
  tokenCap: number;
  buyCost: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cardsToWin: 10,
  startingTokens: 2,
  tokenCap: 5,
  buyCost: 3,
};

export type Phase = 'deciding' | 'stealWindow' | 'reveal' | 'finished';

export interface Steal {
  teamId: TeamId;
  slot: number;
}

export interface Turn {
  teamId: TeamId;
  trackId: TrackId;
  slot: number | null;
  nameCorrect: boolean;
  /** In arrival order at the host. */
  steals: Steal[];
}

export interface Outcome {
  trackId: TrackId;
  activeTeamId: TeamId;
  activeCorrect: boolean;
  cardWonBy: TeamId | null;
  nameBonus: boolean;
}

export interface GameState {
  settings: Settings;
  teams: Team[];
  years: Record<TrackId, number>;
  /** Next track to play is deck[0]. */
  deck: TrackId[];
  discard: TrackId[];
  turnOrder: TeamId[];
  turnIndex: number;
  turn: Turn | null;
  phase: Phase;
  lastOutcome: Outcome | null;
  winnerIds: TeamId[];
}

export type Action =
  | { type: 'place'; teamId: TeamId; slot: number }
  | { type: 'skip'; teamId: TeamId }
  | { type: 'lockIn'; teamId: TeamId; nameCorrect: boolean }
  | { type: 'trackFailed' }
  | { type: 'passTurn' }
  | { type: 'steal'; teamId: TeamId; slot: number }
  | { type: 'closeSteals' }
  | { type: 'nextTurn' }
  | { type: 'buy'; teamId: TeamId };

export type Result = { ok: true; state: GameState } | { ok: false; reason: string };
```

- [ ] **Step 2: Write the failing test** — `src/engine/timeline.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { insertCard, isCorrectSlot, isValidSlot } from './timeline';
import type { Card } from './types';

const tl: Card[] = [
  { trackId: 'a', year: 1977 },
  { trackId: 'b', year: 1985 },
  { trackId: 'c', year: 1999 },
];

describe('isValidSlot', () => {
  it('accepts integers from 0 to length', () => {
    expect([0, 1, 2, 3].map((s) => isValidSlot(tl, s))).toEqual([true, true, true, true]);
  });
  it('rejects out-of-range and non-integer slots', () => {
    expect([-1, 4, 1.5, Number.NaN].map((s) => isValidSlot(tl, s))).toEqual([false, false, false, false]);
  });
});

describe('isCorrectSlot', () => {
  it('checks the year falls between neighbours', () => {
    expect(isCorrectSlot(tl, 0, 1960)).toBe(true);
    expect(isCorrectSlot(tl, 2, 1991)).toBe(true);
    expect(isCorrectSlot(tl, 3, 2010)).toBe(true);
    expect(isCorrectSlot(tl, 1, 1991)).toBe(false);
    expect(isCorrectSlot(tl, 0, 1980)).toBe(false);
  });
  it('accepts an equal year on either side', () => {
    expect(isCorrectSlot(tl, 1, 1985)).toBe(true);
    expect(isCorrectSlot(tl, 2, 1985)).toBe(true);
  });
  it('accepts any slot on an empty timeline only at 0', () => {
    expect(isCorrectSlot([], 0, 1991)).toBe(true);
    expect(isCorrectSlot([], 1, 1991)).toBe(false);
  });
  it('rejects invalid slots', () => {
    expect(isCorrectSlot(tl, 1.5, 1980)).toBe(false);
    expect(isCorrectSlot(tl, -1, 1960)).toBe(false);
  });
});

describe('insertCard', () => {
  it('inserts at the sorted position without mutating', () => {
    const out = insertCard(tl, { trackId: 'x', year: 1991 });
    expect(out.map((c) => c.year)).toEqual([1977, 1985, 1991, 1999]);
    expect(tl).toHaveLength(3);
  });
  it('puts an equal year after existing ones', () => {
    const out = insertCard(tl, { trackId: 'x', year: 1985 });
    expect(out.map((c) => c.trackId)).toEqual(['a', 'b', 'x', 'c']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/timeline.test.ts`
Expected: FAIL — cannot resolve `./timeline`.

- [ ] **Step 4: Write `src/engine/timeline.ts`**

```ts
import type { Card } from './types';

export function isValidSlot(timeline: Card[], slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= timeline.length;
}

export function isCorrectSlot(timeline: Card[], slot: number, year: number): boolean {
  if (!isValidSlot(timeline, slot)) return false;
  const left = slot > 0 ? timeline[slot - 1].year : -Infinity;
  const right = slot < timeline.length ? timeline[slot].year : Infinity;
  return left <= year && year <= right;
}

export function insertCard(timeline: Card[], card: Card): Card[] {
  const i = timeline.findIndex((c) => c.year > card.year);
  const at = i === -1 ? timeline.length : i;
  return [...timeline.slice(0, at), card, ...timeline.slice(at)];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/timeline.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine
git commit -m "feat(engine): add game types and timeline slot helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `createGame` and the `apply` reducer skeleton

**Files:**
- Create: `src/engine/game.ts`, `src/engine/testkit.ts`
- Test: `src/engine/game.create.test.ts`

**Interfaces:**
- Consumes: Task 2 types and helpers.
- Produces:
  - `interface TeamSetup { id: TeamId; name: string; playerIds: string[] }`
  - `createGame(settings: Settings, teams: TeamSetup[], deck: TrackId[], years: Record<TrackId, number>): GameState` — `deck` is already shuffled; deals `deck[0..n-1]` to teams in order, oldest starting card plays first, then draws the first turn track.
  - `apply(state: GameState, action: Action): Result` — never mutates `state`; returns `{ ok: false, reason }` on any rule violation. Fixed reasons: `'game is finished'`, `'unknown team'`, `'unknown action'`.
  - Internal helpers in `game.ts` (later tasks add handlers to the same file): `handle(s, a)`, `activeTeamId(s)`, `team(s, id)`, `drawForCurrentTeam(s)`, `finishByLongest(s)`, `checkWin(s, teamId)`.
  - `testkit.ts`: `TEAMS`, `DECK`, `YEARS`, `newGame(settings?, deck?)`, `ok(result)`, `run(state, ...actions)`, `teamOf(state, id)`.

- [ ] **Step 1: Write the test fixture** — `src/engine/testkit.ts`

```ts
import { apply, createGame, type TeamSetup } from './game';
import { DEFAULT_SETTINGS, type Action, type GameState, type Result, type Settings, type Team } from './types';

export const TEAMS: TeamSetup[] = [
  { id: 'A', name: 'Vinyl', playerIds: ['p1'] },
  { id: 'B', name: 'Cassette', playerIds: ['p2'] },
  { id: 'C', name: 'Mixtape', playerIds: ['p3'] },
];

// a1/b1/c1 are dealt as starting cards; t1 is B's first track (B has the oldest card).
export const YEARS: Record<string, number> = {
  a1: 1985, b1: 1977, c1: 2003,
  t1: 1991, t2: 1960, t3: 2000, t4: 1977, t5: 2010, t6: 1995,
};
export const DECK = ['a1', 'b1', 'c1', 't1', 't2', 't3', 't4', 't5', 't6'];

export function newGame(settings: Partial<Settings> = {}, deck: string[] = DECK): GameState {
  return createGame({ ...DEFAULT_SETTINGS, ...settings }, TEAMS, deck, YEARS);
}

export function ok(r: Result): GameState {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.state;
}

export function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((s, a) => ok(apply(s, a)), state);
}

export function teamOf(state: GameState, id: string): Team {
  const t = state.teams.find((x) => x.id === id);
  if (!t) throw new Error(`no team ${id}`);
  return t;
}
```

- [ ] **Step 2: Write the failing test** — `src/engine/game.create.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { apply, createGame } from './game';
import { DEFAULT_SETTINGS } from './types';
import { TEAMS, YEARS, newGame, teamOf } from './testkit';

describe('createGame', () => {
  it('deals one face-up card and the starting tokens to each team', () => {
    const g = newGame();
    expect(teamOf(g, 'A').timeline).toEqual([{ trackId: 'a1', year: 1985 }]);
    expect(teamOf(g, 'B').timeline).toEqual([{ trackId: 'b1', year: 1977 }]);
    expect(teamOf(g, 'C').timeline).toEqual([{ trackId: 'c1', year: 2003 }]);
    expect(g.teams.map((t) => t.tokens)).toEqual([2, 2, 2]);
  });

  it('lets the team with the oldest starting card play first, then rotates', () => {
    const g = newGame();
    expect(g.turnOrder).toEqual(['B', 'C', 'A']);
    expect(g.phase).toBe('deciding');
    expect(g.turn).toEqual({ teamId: 'B', trackId: 't1', slot: null, nameCorrect: false, steals: [] });
    expect(g.deck).toEqual(['t2', 't3', 't4', 't5', 't6']);
  });

  it('fails loudly when a deck track has no year', () => {
    expect(() => createGame(DEFAULT_SETTINGS, TEAMS, ['a1', 'b1', 'c1', 'zz'], YEARS)).toThrow('no year for zz');
  });

  it('requires at least two teams', () => {
    expect(() => createGame(DEFAULT_SETTINGS, [TEAMS[0]], ['a1', 't1'], YEARS)).toThrow('need at least 2 teams');
  });

  it('requires a card per team plus one track to play', () => {
    expect(() => createGame(DEFAULT_SETTINGS, TEAMS, ['a1', 'b1', 'c1'], YEARS)).toThrow('deck too small');
  });
});

describe('apply (skeleton)', () => {
  it('rejects actions from unknown teams without touching state', () => {
    const g = newGame();
    expect(apply(g, { type: 'place', teamId: 'Z', slot: 0 })).toEqual({ ok: false, reason: 'unknown team' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engine/game.create.test.ts`
Expected: FAIL — cannot resolve `./game`.

- [ ] **Step 4: Write `src/engine/game.ts`**

```ts
import type { Action, GameState, Result, Settings, Team, TeamId, TrackId } from './types';

export interface TeamSetup {
  id: TeamId;
  name: string;
  playerIds: string[];
}

export function createGame(
  settings: Settings,
  teams: TeamSetup[],
  deck: TrackId[],
  years: Record<TrackId, number>,
): GameState {
  if (teams.length < 2) throw new Error('need at least 2 teams');
  for (const id of deck) {
    if (years[id] === undefined) throw new Error(`no year for ${id}`);
  }
  if (deck.length < teams.length + 1) throw new Error('deck too small');

  const remaining = [...deck];
  const built: Team[] = teams.map((t) => {
    const trackId = remaining.shift()!;
    return {
      id: t.id,
      name: t.name,
      playerIds: [...t.playerIds],
      timeline: [{ trackId, year: years[trackId] }],
      tokens: settings.startingTokens,
    };
  });

  const start = built.reduce(
    (best, t, i) => (t.timeline[0].year < built[best].timeline[0].year ? i : best),
    0,
  );
  const turnOrder = [...built.slice(start), ...built.slice(0, start)].map((t) => t.id);

  const state: GameState = {
    settings: { ...settings },
    teams: built,
    years: { ...years },
    deck: remaining,
    discard: [],
    turnOrder,
    turnIndex: 0,
    turn: null,
    phase: 'deciding',
    lastOutcome: null,
    winnerIds: [],
  };
  drawForCurrentTeam(state);
  return state;
}

export function apply(state: GameState, action: Action): Result {
  if (state.phase === 'finished') return { ok: false, reason: 'game is finished' };
  if ('teamId' in action && !state.teams.some((t) => t.id === action.teamId)) {
    return { ok: false, reason: 'unknown team' };
  }
  const s = structuredClone(state);
  const reason = handle(s, action);
  return reason === null ? { ok: true, state: s } : { ok: false, reason };
}

/** Mutates the clone `s`. Returns a rejection reason, or null on success. */
function handle(s: GameState, a: Action): string | null {
  switch (a.type) {
    default:
      return 'unknown action';
  }
}

function activeTeamId(s: GameState): TeamId {
  return s.turnOrder[s.turnIndex % s.turnOrder.length];
}

function team(s: GameState, id: TeamId): Team {
  return s.teams.find((t) => t.id === id)!;
}

function drawForCurrentTeam(s: GameState): void {
  const trackId = s.deck.shift();
  if (trackId === undefined) {
    finishByLongest(s);
    return;
  }
  s.turn = { teamId: activeTeamId(s), trackId, slot: null, nameCorrect: false, steals: [] };
  s.phase = 'deciding';
}

function finishByLongest(s: GameState): void {
  const max = Math.max(...s.teams.map((t) => t.timeline.length));
  s.winnerIds = s.teams.filter((t) => t.timeline.length === max).map((t) => t.id);
  s.turn = null;
  s.phase = 'finished';
}

/** Ends the game if `teamId` reached the target. */
function checkWin(s: GameState, teamId: TeamId): boolean {
  if (team(s, teamId).timeline.length < s.settings.cardsToWin) return false;
  s.winnerIds = [teamId];
  s.phase = 'finished';
  return true;
}
```

Note: `checkWin` is unused until Task 5; if `tsc` flags it, that is expected only under `noUnusedLocals`, which this tsconfig does not enable.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/game.create.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine
git commit -m "feat(engine): createGame deals cards and orders turns; apply skeleton

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Deciding-phase actions (place, lockIn, skip, trackFailed, passTurn)

**Files:**
- Modify: `src/engine/game.ts` (add cases to `handle`, add handler functions)
- Test: `src/engine/game.turn.test.ts`

**Interfaces:**
- Consumes: Task 3 `apply`, helpers; Task 2 `isValidSlot`.
- Produces: action behaviour and fixed reasons `'not allowed during <phase>'`, `'not your turn'`, `'invalid slot'`, `'place the card first'`, `'not enough tokens'`, `'no track playing'`.

- [ ] **Step 1: Write the failing test** — `src/engine/game.turn.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { apply } from './game';
import { newGame, run, teamOf } from './testkit';

describe('place', () => {
  it('records the active team slot', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 });
    expect(g.turn?.slot).toBe(1);
  });
  it('can be changed before locking in', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'place', teamId: 'B', slot: 0 });
    expect(g.turn?.slot).toBe(0);
  });
  it('rejects other teams', () => {
    expect(apply(newGame(), { type: 'place', teamId: 'A', slot: 0 })).toEqual({ ok: false, reason: 'not your turn' });
  });
  it.each([1.5, -1, 2, Number.NaN])('rejects malformed slot %s', (slot) => {
    expect(apply(newGame(), { type: 'place', teamId: 'B', slot })).toEqual({ ok: false, reason: 'invalid slot' });
  });
});

describe('lockIn', () => {
  it('requires a placement', () => {
    expect(apply(newGame(), { type: 'lockIn', teamId: 'B', nameCorrect: false })).toEqual({
      ok: false,
      reason: 'place the card first',
    });
  });
  it('opens the steal window and stores the naming result', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: true });
    expect(g.phase).toBe('stealWindow');
    expect(g.turn?.nameCorrect).toBe(true);
  });
  it('rejects placing after lock-in', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'place', teamId: 'B', slot: 0 })).toEqual({ ok: false, reason: 'not allowed during stealWindow' });
  });
});

describe('skip', () => {
  it('costs one token and plays the next track for the same team', () => {
    const g = run(newGame(), { type: 'skip', teamId: 'B' });
    expect(teamOf(g, 'B').tokens).toBe(1);
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't2', slot: null });
    expect(g.discard).toEqual(['t1']);
  });
  it('is rejected without tokens', () => {
    expect(apply(newGame({ startingTokens: 0 }), { type: 'skip', teamId: 'B' })).toEqual({
      ok: false,
      reason: 'not enough tokens',
    });
  });
  it('ends the game by longest timeline when the deck runs out (ties shared)', () => {
    const g = run(newGame({}, ['a1', 'b1', 'c1', 't1']), { type: 'skip', teamId: 'B' });
    expect(g.phase).toBe('finished');
    expect(g.turn).toBeNull();
    expect(g.winnerIds).toEqual(['A', 'B', 'C']);
  });
});

describe('trackFailed', () => {
  it('replaces the track at no cost', () => {
    const g = run(newGame(), { type: 'trackFailed' });
    expect(teamOf(g, 'B').tokens).toBe(2);
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't2' });
    expect(g.discard).toEqual(['t1']);
  });
  it('only applies while deciding', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'trackFailed' })).toEqual({ ok: false, reason: 'not allowed during stealWindow' });
  });
});

describe('passTurn', () => {
  it('discards the track and moves to the next team', () => {
    const g = run(newGame(), { type: 'passTurn' });
    expect(g.turn).toMatchObject({ teamId: 'C', trackId: 't2' });
    expect(g.turnIndex).toBe(1);
    expect(g.discard).toEqual(['t1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/game.turn.test.ts`
Expected: FAIL — reasons are `'unknown action'`.

- [ ] **Step 3: Implement** — in `src/engine/game.ts`, add the import and replace the `handle` function, then append the handlers.

Change the import line at the top to:
```ts
import { isValidSlot } from './timeline';
import type { Action, GameState, Phase, Result, Settings, Team, TeamId, TrackId } from './types';
```

Replace `handle` with:
```ts
/** Mutates the clone `s`. Returns a rejection reason, or null on success. */
function handle(s: GameState, a: Action): string | null {
  switch (a.type) {
    case 'place':
      return place(s, a.teamId, a.slot);
    case 'lockIn':
      return lockIn(s, a.teamId, a.nameCorrect);
    case 'skip':
      return skip(s, a.teamId);
    case 'trackFailed':
      return trackFailed(s);
    case 'passTurn':
      return passTurn(s);
    default:
      return 'unknown action';
  }
}
```

Append:
```ts
function requirePhase(s: GameState, phase: Phase): string | null {
  if (s.phase !== phase) return `not allowed during ${s.phase}`;
  if (!s.turn) return 'no track playing';
  return null;
}

function requireActive(s: GameState, teamId: TeamId, phase: Phase): string | null {
  const err = requirePhase(s, phase);
  if (err) return err;
  if (s.turn!.teamId !== teamId) return 'not your turn';
  return null;
}

function place(s: GameState, teamId: TeamId, slot: number): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  if (!isValidSlot(team(s, teamId).timeline, slot)) return 'invalid slot';
  s.turn!.slot = slot;
  return null;
}

function lockIn(s: GameState, teamId: TeamId, nameCorrect: boolean): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  if (s.turn!.slot === null) return 'place the card first';
  s.turn!.nameCorrect = nameCorrect;
  s.phase = 'stealWindow';
  return null;
}

function skip(s: GameState, teamId: TeamId): string | null {
  const err = requireActive(s, teamId, 'deciding');
  if (err) return err;
  const t = team(s, teamId);
  if (t.tokens < 1) return 'not enough tokens';
  t.tokens -= 1;
  s.discard.push(s.turn!.trackId);
  drawForCurrentTeam(s);
  return null;
}

function trackFailed(s: GameState): string | null {
  const err = requirePhase(s, 'deciding');
  if (err) return err;
  s.discard.push(s.turn!.trackId);
  drawForCurrentTeam(s);
  return null;
}

function passTurn(s: GameState): string | null {
  const err = requirePhase(s, 'deciding');
  if (err) return err;
  s.discard.push(s.turn!.trackId);
  s.turnIndex += 1;
  drawForCurrentTeam(s);
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): place, lock in, skip, track failure and pass turn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Steal window and reveal (steal, closeSteals, naming bonus, win)

**Files:**
- Modify: `src/engine/game.ts`
- Test: `src/engine/game.steal.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `steal` and `closeSteals` actions; `state.lastOutcome: Outcome` after reveal; reasons `'no steal window open'`, `'cannot steal your own card'`, `'already stole this turn'`, `'slot taken'`, `'not enough tokens'`, `'invalid slot'`.

- [ ] **Step 1: Write the failing test** — `src/engine/game.steal.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { apply } from './game';
import type { GameState } from './types';
import { newGame, run, teamOf } from './testkit';

const lockedAt = (slot: number, nameCorrect = false, g: GameState = newGame()) =>
  run(g, { type: 'place', teamId: 'B', slot }, { type: 'lockIn', teamId: 'B', nameCorrect });

/** B's timeline becomes [1977, 1991]; the current track t1 is 1991 → slots 1 and 2 correct, 0 wrong. */
function withLongerB(): GameState {
  const g = structuredClone(newGame());
  teamOf(g, 'B').timeline = [
    { trackId: 'b1', year: 1977 },
    { trackId: 'x', year: 1991 },
  ];
  return g;
}

describe('reveal without steals', () => {
  it('keeps a correctly placed card', () => {
    const g = run(lockedAt(1), { type: 'closeSteals' });
    expect(g.phase).toBe('reveal');
    expect(teamOf(g, 'B').timeline.map((c) => c.year)).toEqual([1977, 1991]);
    expect(g.lastOutcome).toEqual({ trackId: 't1', activeTeamId: 'B', activeCorrect: true, cardWonBy: 'B', nameBonus: false });
  });
  it('discards a wrongly placed card', () => {
    const g = run(lockedAt(0), { type: 'closeSteals' });
    expect(teamOf(g, 'B').timeline).toHaveLength(1);
    expect(g.discard).toEqual(['t1']);
    expect(g.lastOutcome?.cardWonBy).toBeNull();
  });
});

describe('steal validation', () => {
  it('only works during the steal window', () => {
    expect(apply(newGame(), { type: 'steal', teamId: 'C', slot: 0 })).toEqual({ ok: false, reason: 'no steal window open' });
  });
  it('rejects the active team', () => {
    expect(apply(lockedAt(1), { type: 'steal', teamId: 'B', slot: 0 })).toEqual({ ok: false, reason: 'cannot steal your own card' });
  });
  it("rejects the active team's slot and already-taken slots", () => {
    const g = lockedAt(1);
    expect(apply(g, { type: 'steal', teamId: 'C', slot: 1 })).toEqual({ ok: false, reason: 'slot taken' });
    const g2 = run(g, { type: 'steal', teamId: 'C', slot: 0 });
    expect(apply(g2, { type: 'steal', teamId: 'A', slot: 0 })).toEqual({ ok: false, reason: 'slot taken' });
  });
  it('allows one steal per team per turn', () => {
    const g = run(withLongerB(), { type: 'place', teamId: 'B', slot: 0 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    const g2 = run(g, { type: 'steal', teamId: 'C', slot: 1 });
    expect(apply(g2, { type: 'steal', teamId: 'C', slot: 2 })).toEqual({ ok: false, reason: 'already stole this turn' });
  });
  it('needs a token', () => {
    const g = lockedAt(1, false, newGame({ startingTokens: 0 }));
    expect(apply(g, { type: 'steal', teamId: 'C', slot: 0 })).toEqual({ ok: false, reason: 'not enough tokens' });
  });
  it.each([1.5, -1, 5])('rejects malformed slot %s', (slot) => {
    expect(apply(lockedAt(1), { type: 'steal', teamId: 'C', slot })).toEqual({ ok: false, reason: 'invalid slot' });
  });
  it('spends the token immediately', () => {
    const g = run(lockedAt(1), { type: 'steal', teamId: 'C', slot: 0 });
    expect(teamOf(g, 'C').tokens).toBe(1);
  });
});

describe('reveal with steals', () => {
  it('gives the card to the first correct stealer in arrival order', () => {
    const g = run(
      withLongerB(),
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slot: 2 },
      { type: 'steal', teamId: 'A', slot: 1 },
      { type: 'closeSteals' },
    );
    expect(g.lastOutcome).toMatchObject({ activeCorrect: false, cardWonBy: 'C' });
    expect(teamOf(g, 'C').timeline.map((c) => c.year)).toEqual([1991, 2003]);
    expect(teamOf(g, 'A').timeline).toHaveLength(1);
    expect(teamOf(g, 'B').timeline).toHaveLength(2);
    expect([teamOf(g, 'A').tokens, teamOf(g, 'C').tokens]).toEqual([1, 1]);
  });
  it('keeps the card with a correct active team even if a stealer chose another correct same-year slot', () => {
    const g = run(
      withLongerB(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slot: 2 },
      { type: 'closeSteals' },
    );
    expect(g.lastOutcome).toMatchObject({ activeCorrect: true, cardWonBy: 'B' });
    expect(teamOf(g, 'C').tokens).toBe(1);
    expect(teamOf(g, 'C').timeline).toHaveLength(1);
  });
  it('discards the card when every steal is wrong too', () => {
    // B's timeline [1977, 1985]; t1 is 1991 → only slot 2 is correct.
    const g0 = structuredClone(newGame());
    teamOf(g0, 'B').timeline = [
      { trackId: 'b1', year: 1977 },
      { trackId: 'y', year: 1985 },
    ];
    const g = run(
      g0,
      { type: 'place', teamId: 'B', slot: 0 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'steal', teamId: 'C', slot: 1 },
      { type: 'closeSteals' },
    );
    expect(g.lastOutcome?.cardWonBy).toBeNull();
    expect(g.discard).toEqual(['t1']);
    expect(teamOf(g, 'C').tokens).toBe(1);
  });
});

describe('naming bonus', () => {
  it('earns a token even when the placement is wrong', () => {
    const g = run(lockedAt(0, true), { type: 'closeSteals' });
    expect(teamOf(g, 'B').tokens).toBe(3);
    expect(g.lastOutcome?.nameBonus).toBe(true);
  });
  it('never exceeds the token cap', () => {
    const g = run(lockedAt(1, true, newGame({ startingTokens: 5 })), { type: 'closeSteals' });
    expect(teamOf(g, 'B').tokens).toBe(5);
  });
});

describe('winning', () => {
  it('ends the game when a team reaches the target', () => {
    const g = run(lockedAt(1, false, newGame({ cardsToWin: 2 })), { type: 'closeSteals' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['B']);
    expect(apply(g, { type: 'nextTurn' })).toEqual({ ok: false, reason: 'game is finished' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/game.steal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `src/engine/game.ts`:

Change the timeline import to:
```ts
import { insertCard, isCorrectSlot, isValidSlot } from './timeline';
```

Add to the `switch` in `handle` (before `default`):
```ts
    case 'steal':
      return steal(s, a.teamId, a.slot);
    case 'closeSteals':
      return closeSteals(s);
```

Append:
```ts
function steal(s: GameState, teamId: TeamId, slot: number): string | null {
  if (s.phase !== 'stealWindow' || !s.turn) return 'no steal window open';
  const turn = s.turn;
  if (teamId === turn.teamId) return 'cannot steal your own card';
  const thief = team(s, teamId);
  if (turn.steals.some((x) => x.teamId === teamId)) return 'already stole this turn';
  if (thief.tokens < 1) return 'not enough tokens';
  if (!isValidSlot(team(s, turn.teamId).timeline, slot)) return 'invalid slot';
  if (slot === turn.slot || turn.steals.some((x) => x.slot === slot)) return 'slot taken';
  thief.tokens -= 1;
  turn.steals.push({ teamId, slot });
  return null;
}

function closeSteals(s: GameState): string | null {
  if (s.phase !== 'stealWindow' || !s.turn) return 'no steal window open';
  const { trackId, teamId, slot, nameCorrect, steals } = s.turn;
  const year = s.years[trackId];
  const active = team(s, teamId);

  const activeCorrect = isCorrectSlot(active.timeline, slot!, year);
  let cardWonBy: TeamId | null = activeCorrect ? teamId : null;
  if (!activeCorrect) {
    const winner = steals.find((x) => isCorrectSlot(active.timeline, x.slot, year));
    cardWonBy = winner ? winner.teamId : null;
  }

  if (cardWonBy) {
    const w = team(s, cardWonBy);
    w.timeline = insertCard(w.timeline, { trackId, year });
  } else {
    s.discard.push(trackId);
  }
  if (nameCorrect) active.tokens = Math.min(s.settings.tokenCap, active.tokens + 1);

  s.lastOutcome = { trackId, activeTeamId: teamId, activeCorrect, cardWonBy, nameBonus: nameCorrect };
  s.phase = 'reveal';
  if (cardWonBy) checkWin(s, cardWonBy);
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): TUBESTER! steals, reveal resolution, naming bonus and win

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Next turn, buying a card, and deck exhaustion

**Files:**
- Modify: `src/engine/game.ts`
- Test: `src/engine/game.end.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces: `nextTurn` and `buy` actions; reasons `'cannot buy now'`, `'deck is empty'`.

- [ ] **Step 1: Write the failing test** — `src/engine/game.end.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { apply } from './game';
import { newGame, run, teamOf } from './testkit';

const revealed = (g = newGame()) =>
  run(g, { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false }, { type: 'closeSteals' });

describe('nextTurn', () => {
  it('moves to the next team with the next track', () => {
    const g = run(revealed(), { type: 'nextTurn' });
    expect(g.phase).toBe('deciding');
    expect(g.turnIndex).toBe(1);
    expect(g.turn).toMatchObject({ teamId: 'C', trackId: 't2', slot: null, steals: [] });
  });
  it('wraps around the turn order', () => {
    let g = revealed();
    g = run(g, { type: 'nextTurn' }, { type: 'passTurn' }, { type: 'passTurn' });
    expect(g.turn?.teamId).toBe('B');
  });
  it('is only allowed after a reveal', () => {
    expect(apply(newGame(), { type: 'nextTurn' })).toEqual({ ok: false, reason: 'not allowed during deciding' });
  });
  it('ends the game by longest timeline when the deck is empty', () => {
    const g = run(revealed(newGame({}, ['a1', 'b1', 'c1', 't1'])), { type: 'nextTurn' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['B']);
  });
});

describe('buy', () => {
  it('spends tokens and inserts the next deck card without touching the current turn', () => {
    const g = run(newGame({ startingTokens: 3 }), { type: 'buy', teamId: 'A' });
    expect(teamOf(g, 'A').tokens).toBe(0);
    expect(teamOf(g, 'A').timeline.map((c) => c.trackId)).toEqual(['t2', 'a1']);
    expect(g.deck[0]).toBe('t3');
    expect(g.turn).toMatchObject({ teamId: 'B', trackId: 't1' });
  });
  it('works during the steal window', () => {
    const g = run(newGame({ startingTokens: 3 }), { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    expect(apply(g, { type: 'buy', teamId: 'C' }).ok).toBe(true);
  });
  it('needs enough tokens', () => {
    expect(apply(newGame(), { type: 'buy', teamId: 'A' })).toEqual({ ok: false, reason: 'not enough tokens' });
  });
  it('is not allowed during a reveal', () => {
    expect(apply(revealed(newGame({ startingTokens: 3 })), { type: 'buy', teamId: 'A' })).toEqual({
      ok: false,
      reason: 'cannot buy now',
    });
  });
  it('fails when the deck is empty', () => {
    expect(apply(newGame({ startingTokens: 3 }, ['a1', 'b1', 'c1', 't1']), { type: 'buy', teamId: 'A' })).toEqual({
      ok: false,
      reason: 'deck is empty',
    });
  });
  it('can win the game', () => {
    const g = run(newGame({ startingTokens: 3, cardsToWin: 2 }), { type: 'buy', teamId: 'A' });
    expect(g.phase).toBe('finished');
    expect(g.winnerIds).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/game.end.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `src/engine/game.ts`, add to the `switch` (before `default`):

```ts
    case 'nextTurn':
      return nextTurn(s);
    case 'buy':
      return buy(s, a.teamId);
```

Append:
```ts
function nextTurn(s: GameState): string | null {
  if (s.phase !== 'reveal') return `not allowed during ${s.phase}`;
  s.turnIndex += 1;
  drawForCurrentTeam(s);
  return null;
}

function buy(s: GameState, teamId: TeamId): string | null {
  if (s.phase !== 'deciding' && s.phase !== 'stealWindow') return 'cannot buy now';
  const t = team(s, teamId);
  if (t.tokens < s.settings.buyCost) return 'not enough tokens';
  const trackId = s.deck.shift();
  if (trackId === undefined) return 'deck is empty';
  t.tokens -= s.settings.buyCost;
  t.timeline = insertCard(t.timeline, { trackId, year: s.years[trackId] });
  checkWin(s, teamId);
  return null;
}
```

Then replace `default: return 'unknown action';` in `handle` with an exhaustiveness check:
```ts
    default: {
      const never: never = a;
      return `unknown action ${(never as { type: string }).type}`;
    }
```

- [ ] **Step 4: Run all engine tests and typecheck**

Run: `npx vitest run src/engine && npm run typecheck`
Expected: PASS, typecheck clean (the `never` check proves every action is handled).

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): next turn, buy a card, deck exhaustion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Fuzzy title/artist matcher

**Files:**
- Create: `src/match/match.ts`
- Test: `src/match/match.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalize(s: string): string`
  - `levenshtein(a: string, b: string): number`
  - `similar(a: string, b: string, threshold?: number): boolean` (default `0.8`; both already normalized)
  - `interface Guess { title: string; artist: string }`
  - `matchesGuess(guess: Guess, track: { title: string; artists: string[] }): boolean` — true only if title AND one of the artists match.

- [ ] **Step 1: Write the failing test** — `src/match/match.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { levenshtein, matchesGuess, normalize } from './match';

describe('normalize', () => {
  it.each([
    ['Bohemian Rhapsody - Remastered 2011', 'bohemian rhapsody'],
    ['Crazy in Love (feat. Jay-Z)', 'crazy in love'],
    ['Somebody That I Used to Know [Live]', 'somebody that i used to know'],
    ['Beyoncé', 'beyonce'],
    ["Guns N' Roses", 'guns and roses'],
    ['Simon & Garfunkel', 'simon and garfunkel'],
    ['The Beatles', 'beatles'],
    ['Lose Yourself feat. Eminem', 'lose yourself'],
    ['  AC/DC  ', 'ac dc'],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('matchesGuess', () => {
  const queen = { title: 'Bohemian Rhapsody - Remastered 2011', artists: ['Queen'] };
  const beyonce = { title: 'Crazy in Love (feat. Jay-Z)', artists: ['Beyoncé', 'JAY-Z'] };

  it.each([
    [{ title: 'bohemian rapsody', artist: 'queen' }, queen],
    [{ title: 'Bohemian Rhapsody', artist: 'Queen' }, queen],
    [{ title: 'crazy in love', artist: 'beyonce' }, beyonce],
    [{ title: 'crazy in love', artist: 'jay z' }, beyonce],
    [{ title: 'smells like teen sprit', artist: 'nirvana' }, { title: 'Smells Like Teen Spirit', artists: ['Nirvana'] }],
    [{ title: 'sweet child o mine', artist: 'guns and roses' }, { title: "Sweet Child O' Mine", artists: ["Guns N' Roses"] }],
  ])('accepts %j', (guess, track) => {
    expect(matchesGuess(guess, track)).toBe(true);
  });

  it.each([
    [{ title: 'crazy', artist: 'beyonce' }, beyonce],
    [{ title: 'bohemian rhapsody', artist: 'freddie mercury' }, queen],
    [{ title: 'bohemian rhapsody', artist: '' }, queen],
    [{ title: '', artist: 'queen' }, queen],
    [{ title: '   ', artist: '  ' }, queen],
  ])('rejects %j', (guess, track) => {
    expect(matchesGuess(guess, track)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/match`
Expected: FAIL — cannot resolve `./match`.

- [ ] **Step 3: Write `src/match/match.ts`**

```ts
export interface Guess {
  title: string;
  artist: string;
}

export function normalize(input: string): string {
  let x = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  x = x.replace(/[([][^)\]]*[)\]]/g, ' '); // (feat. …), [Live], (Remastered)
  x = x.replace(/\s+-\s+.*$/, ' '); // " - Remastered 2011", " - Live"
  x = x.replace(/\b(feat|ft|featuring)\b.*$/, ' ');
  x = x.replace(/&/g, ' and ');
  x = x.replace(/['’]/g, '');
  x = x.replace(/[^a-z0-9]+/g, ' ');
  x = x.replace(/\bn\b/g, 'and'); // guns n roses → guns and roses
  x = x.trim().replace(/\s+/g, ' ');
  x = x.replace(/^the /, '');
  return x;
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similar(a: string, b: string, threshold = 0.8): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= threshold;
}

export function matchesGuess(guess: Guess, track: { title: string; artists: string[] }): boolean {
  const title = normalize(guess.title);
  const artist = normalize(guess.artist);
  if (!title || !artist) return false;
  return similar(title, normalize(track.title)) && track.artists.some((a) => similar(artist, normalize(a)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/match`
Expected: PASS. If a normalize case fails, fix the regex order in `normalize`, not the expected value — the table is the spec.

- [ ] **Step 5: Commit**

```bash
git add src/match
git commit -m "feat(match): fuzzy title/artist matcher for the naming bonus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Music types and MusicBrainz year resolver

**Files:**
- Create: `src/music/types.ts`, `src/years/musicbrainz.ts`, `src/years/rateLimit.ts`, `src/years/cache.ts`, `src/years/resolve.ts`
- Test: `src/years/musicbrainz.test.ts`, `src/years/rateLimit.test.ts`, `src/years/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/music/types.ts`: `interface Track { id: string; title: string; artists: string[]; isrc?: string; sourceYear: number }`, `interface PlaylistSummary { id: string; name: string; trackCount: number }`, `interface PlaybackError { trackId: string; message: string }`, `interface MusicSource { listPlaylists(): Promise<PlaylistSummary[]>; loadPlaylist(id: string): Promise<Track[]>; ready(): Promise<void>; play(trackId: string): Promise<void>; stop(): Promise<void>; onError(cb: (e: PlaybackError) => void): void }`
  - `type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`
  - `lookupEarliestYear(isrc: string, fetchFn: FetchLike): Promise<number | null>` — throws on HTTP error.
  - `createRateLimiter(intervalMs: number, sleep?: (ms: number) => Promise<void>, now?: () => number): <T>(fn: () => Promise<T>) => Promise<T>`
  - `interface YearCache { get(isrc: string): Promise<number | null | undefined>; set(isrc: string, year: number | null): Promise<void> }`, `memoryYearCache(): YearCache`, `idbYearCache(): YearCache`
  - `type YearFlag = 'ok' | 'mismatch' | 'nomatch'`, `interface ResolvedTrack extends Track { year: number; mbYear: number | null; flag: YearFlag }`
  - `resolveYears(tracks: Track[], deps: { lookup: (isrc: string) => Promise<number | null>; cache: YearCache; onProgress?: (done: number, total: number) => void }): Promise<ResolvedTrack[]>`

- [ ] **Step 1: Write `src/music/types.ts`**

```ts
export interface Track {
  id: string;
  title: string;
  artists: string[];
  isrc?: string;
  /** Year reported by the music source (often a remaster/compilation date). */
  sourceYear: number;
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
```

- [ ] **Step 2: Write the failing tests**

`src/years/musicbrainz.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { lookupEarliestYear, type FetchLike } from './musicbrainz';

const respond = (body: unknown, status = 200): FetchLike => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('lookupEarliestYear', () => {
  it('returns the earliest first-release year across recordings', async () => {
    const fetchFn = respond({
      recordings: [{ 'first-release-date': '2011-05-02' }, { 'first-release-date': '1975-10-31' }, { 'first-release-date': '1975' }],
    });
    expect(await lookupEarliestYear('GBUM71029604', fetchFn)).toBe(1975);
  });
  it('ignores recordings without a usable date', async () => {
    const fetchFn = respond({ recordings: [{}, { 'first-release-date': '' }, { 'first-release-date': '1991-09-10' }] });
    expect(await lookupEarliestYear('X', fetchFn)).toBe(1991);
  });
  it('returns null when nothing matches', async () => {
    expect(await lookupEarliestYear('X', respond({ recordings: [] }))).toBeNull();
  });
  it('queries by ISRC as JSON', async () => {
    let seen = '';
    await lookupEarliestYear('USSM19922509', async (url) => {
      seen = url;
      return { ok: true, status: 200, json: async () => ({ recordings: [] }) };
    });
    expect(seen).toBe('https://musicbrainz.org/ws/2/recording?query=isrc:USSM19922509&fmt=json&limit=25');
  });
  it('throws on HTTP errors so callers do not cache them', async () => {
    await expect(lookupEarliestYear('X', respond({}, 503))).rejects.toThrow('MusicBrainz 503');
  });
});
```

`src/years/rateLimit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('spaces calls by the interval and preserves order', async () => {
    let t = 0;
    const sleep = async (ms: number) => {
      t += ms;
    };
    const schedule = createRateLimiter(1100, sleep, () => t);
    const calls: number[] = [];
    await Promise.all([1, 2, 3].map((n) => schedule(async () => calls.push(t) && n)));
    expect(calls).toEqual([0, 1100, 2200]);
  });
  it('keeps going after a failing call', async () => {
    let t = 0;
    const schedule = createRateLimiter(10, async (ms) => void (t += ms), () => t);
    await expect(schedule(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(schedule(async () => 42)).resolves.toBe(42);
  });
});
```

`src/years/resolve.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Track } from '../music/types';
import { memoryYearCache } from './cache';
import { resolveYears } from './resolve';

const track = (id: string, sourceYear: number, isrc?: string): Track => ({ id, title: id, artists: ['x'], isrc, sourceYear });

describe('resolveYears', () => {
  it('keeps the earliest year and flags mismatches and misses', async () => {
    const mb: Record<string, number | null> = { R1: 1975, R2: 1991, R3: null };
    const out = await resolveYears(
      [track('remaster', 2011, 'R1'), track('same', 1991, 'R2'), track('miss', 2019, 'R3'), track('noisrc', 2001)],
      { lookup: async (isrc) => mb[isrc], cache: memoryYearCache() },
    );
    expect(out.map((t) => [t.id, t.year, t.mbYear, t.flag])).toEqual([
      ['remaster', 1975, 1975, 'mismatch'],
      ['same', 1991, 1991, 'ok'],
      ['miss', 2019, null, 'nomatch'],
      ['noisrc', 2001, null, 'nomatch'],
    ]);
  });

  it('never moves a year later than the source year', async () => {
    const out = await resolveYears([track('t', 1980, 'R')], { lookup: async () => 1990, cache: memoryYearCache() });
    expect(out[0]).toMatchObject({ year: 1980, mbYear: 1990, flag: 'mismatch' });
  });

  it('uses the cache and skips the lookup', async () => {
    const cache = memoryYearCache();
    await cache.set('R', 1969);
    let calls = 0;
    const out = await resolveYears([track('t', 2009, 'R')], {
      lookup: async () => {
        calls++;
        return 2000;
      },
      cache,
    });
    expect(calls).toBe(0);
    expect(out[0].year).toBe(1969);
  });

  it('caches lookups including misses, but not errors', async () => {
    const cache = memoryYearCache();
    await resolveYears([track('a', 2000, 'HIT'), track('b', 2000, 'MISS'), track('c', 2000, 'ERR')], {
      lookup: async (isrc) => {
        if (isrc === 'ERR') throw new Error('down');
        return isrc === 'HIT' ? 1999 : null;
      },
      cache,
    });
    expect(await cache.get('HIT')).toBe(1999);
    expect(await cache.get('MISS')).toBeNull();
    expect(await cache.get('ERR')).toBeUndefined();
  });

  it('falls back to the source year when MusicBrainz is down', async () => {
    const out = await resolveYears([track('t', 1984, 'R')], {
      lookup: async () => {
        throw new Error('down');
      },
      cache: memoryYearCache(),
    });
    expect(out[0]).toMatchObject({ year: 1984, mbYear: null, flag: 'nomatch' });
  });

  it('reports progress', async () => {
    const seen: string[] = [];
    await resolveYears([track('a', 2000), track('b', 2000)], {
      lookup: async () => null,
      cache: memoryYearCache(),
      onProgress: (d, t) => seen.push(`${d}/${t}`),
    });
    expect(seen).toEqual(['1/2', '2/2']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/years`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/years/musicbrainz.ts`:
```ts
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface SearchBody {
  recordings?: { 'first-release-date'?: string }[];
}

export async function lookupEarliestYear(isrc: string, fetchFn: FetchLike): Promise<number | null> {
  const url = `https://musicbrainz.org/ws/2/recording?query=isrc:${encodeURIComponent(isrc)}&fmt=json&limit=25`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const body = (await res.json()) as SearchBody;
  const years = (body.recordings ?? [])
    .map((r) => Number.parseInt((r['first-release-date'] ?? '').slice(0, 4), 10))
    .filter((y) => Number.isFinite(y) && y > 1800);
  return years.length ? Math.min(...years) : null;
}
```

`src/years/rateLimit.ts`:
```ts
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Serializes calls and spaces their start times by at least `intervalMs` (MusicBrainz allows ~1 req/s). */
export function createRateLimiter(intervalMs: number, sleep = realSleep, now: () => number = Date.now) {
  let nextAt = -Infinity;
  let chain: Promise<unknown> = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = nextAt - now();
      if (wait > 0) await sleep(wait);
      nextAt = now() + intervalMs;
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
```

`src/years/cache.ts`:
```ts
import { createStore, get, set } from 'idb-keyval';

/** `undefined` = never looked up; `null` = looked up, no match. */
export interface YearCache {
  get(isrc: string): Promise<number | null | undefined>;
  set(isrc: string, year: number | null): Promise<void>;
}

export function memoryYearCache(): YearCache {
  const m = new Map<string, number | null>();
  return {
    get: async (isrc) => m.get(isrc),
    set: async (isrc, year) => {
      m.set(isrc, year);
    },
  };
}

export function idbYearCache(): YearCache {
  const store = createStore('tubester', 'years');
  return {
    get: (isrc) => get<number | null>(isrc, store),
    set: (isrc, year) => set(isrc, year, store),
  };
}
```

`src/years/resolve.ts`:
```ts
import type { Track } from '../music/types';
import type { YearCache } from './cache';

export type YearFlag = 'ok' | 'mismatch' | 'nomatch';

export interface ResolvedTrack extends Track {
  /** Year used in the game: the earliest of MusicBrainz and source. */
  year: number;
  mbYear: number | null;
  flag: YearFlag;
}

export interface ResolveDeps {
  lookup: (isrc: string) => Promise<number | null>;
  cache: YearCache;
  onProgress?: (done: number, total: number) => void;
}

export async function resolveYears(tracks: Track[], deps: ResolveDeps): Promise<ResolvedTrack[]> {
  const out: ResolvedTrack[] = [];
  for (const t of tracks) {
    const mbYear = t.isrc ? await yearFor(t.isrc, deps) : null;
    out.push({
      ...t,
      mbYear,
      year: mbYear === null ? t.sourceYear : Math.min(mbYear, t.sourceYear),
      flag: mbYear === null ? 'nomatch' : mbYear === t.sourceYear ? 'ok' : 'mismatch',
    });
    deps.onProgress?.(out.length, tracks.length);
  }
  return out;
}

async function yearFor(isrc: string, { lookup, cache }: ResolveDeps): Promise<number | null> {
  const cached = await cache.get(isrc);
  if (cached !== undefined) return cached;
  try {
    const year = await lookup(isrc);
    await cache.set(isrc, year);
    return year;
  } catch {
    return null; // MusicBrainz down: fall back, do not cache
  }
}
```

Wiring for Plan 3 (documented here, not built now): `lookup = (isrc) => limiter(() => lookupEarliestYear(isrc, fetch))` with `limiter = createRateLimiter(1100)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/years && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/music src/years
git commit -m "feat(years): MusicBrainz earliest-year resolver with rate limit and cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Filtered game view

**Files:**
- Create: `src/host/view.ts`
- Test: `src/host/view.test.ts`

**Interfaces:**
- Consumes: engine types; `testkit` (`newGame`, `run`) in tests.
- Produces:
  - `interface TrackMeta { title: string; artists: string[] }`
  - `interface CardView { trackId: TrackId; year: number; title: string; artists: string[] }`
  - `interface TeamView { id: TeamId; name: string; playerIds: string[]; tokens: number; timeline: CardView[] }`
  - `interface TurnView { teamId: TeamId; slot: number | null; steals: Steal[] }`
  - `interface RevealView { trackId: TrackId; title: string; artists: string[]; year: number; outcome: Outcome }`
  - `interface GameView { phase: Phase; settings: Settings; teams: TeamView[]; turnOrder: TeamId[]; turn: TurnView | null; reveal: RevealView | null; deckRemaining: number; winnerIds: TeamId[]; viewerTeamId: TeamId | null }`
  - `toView(state: GameState, meta: Record<TrackId, TrackMeta>, viewerTeamId: TeamId | null): GameView`

- [ ] **Step 1: Write the failing test** — `src/host/view.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { newGame, run } from '../engine/testkit';
import { toView, type TrackMeta } from './view';

const meta: Record<string, TrackMeta> = {
  a1: { title: 'Take On Me', artists: ['a-ha'] },
  b1: { title: 'Go Your Own Way', artists: ['Fleetwood Mac'] },
  c1: { title: 'Crazy in Love', artists: ['Beyoncé'] },
  t1: { title: 'Secret Song Title', artists: ['Hidden Artist'] },
  t2: { title: 'Two', artists: ['x'] },
};

describe('toView', () => {
  it('shows revealed timeline cards with their metadata', () => {
    const v = toView(newGame(), meta, 'A');
    expect(v.teams[0].timeline).toEqual([{ trackId: 'a1', year: 1985, title: 'Take On Me', artists: ['a-ha'] }]);
    expect(v.viewerTeamId).toBe('A');
    expect(v.deckRemaining).toBe(5);
  });

  it.each(['deciding', 'stealWindow'] as const)('never leaks the current track during %s', (phase) => {
    let g = newGame();
    if (phase === 'stealWindow') {
      g = run(g, { type: 'place', teamId: 'B', slot: 1 }, { type: 'lockIn', teamId: 'B', nameCorrect: false });
    }
    const json = JSON.stringify(toView(g, meta, 'B'));
    expect(json).not.toContain('t1');
    expect(json).not.toContain('Secret Song Title');
    expect(json).not.toContain('Hidden Artist');
    expect(json).not.toContain('1991');
    expect(toView(g, meta, 'B').reveal).toBeNull();
  });

  it('exposes the turn without the track', () => {
    const g = run(newGame(), { type: 'place', teamId: 'B', slot: 1 });
    expect(toView(g, meta, null).turn).toEqual({ teamId: 'B', slot: 1, steals: [] });
  });

  it('reveals title, artists, year and outcome after closeSteals', () => {
    const g = run(
      newGame(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
    );
    expect(toView(g, meta, 'C').reveal).toEqual({
      trackId: 't1',
      title: 'Secret Song Title',
      artists: ['Hidden Artist'],
      year: 1991,
      outcome: { trackId: 't1', activeTeamId: 'B', activeCorrect: true, cardWonBy: 'B', nameBonus: false },
    });
  });

  it('does not show the previous reveal once the next turn starts', () => {
    const g = run(
      newGame(),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
      { type: 'nextTurn' },
    );
    expect(toView(g, meta, 'C').reveal).toBeNull();
  });

  it('keeps the final reveal visible when the game finishes on a reveal', () => {
    const g = run(
      newGame({ cardsToWin: 2 }),
      { type: 'place', teamId: 'B', slot: 1 },
      { type: 'lockIn', teamId: 'B', nameCorrect: false },
      { type: 'closeSteals' },
    );
    const v = toView(g, meta, 'B');
    expect(v.phase).toBe('finished');
    expect(v.reveal?.year).toBe(1991);
    expect(v.winnerIds).toEqual(['B']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/host/view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/host/view.ts`**

```ts
import type { GameState, Outcome, Phase, Settings, Steal, TeamId, TrackId } from '../engine/types';

export interface TrackMeta {
  title: string;
  artists: string[];
}

export interface CardView {
  trackId: TrackId;
  year: number;
  title: string;
  artists: string[];
}

export interface TeamView {
  id: TeamId;
  name: string;
  playerIds: string[];
  tokens: number;
  timeline: CardView[];
}

export interface TurnView {
  teamId: TeamId;
  slot: number | null;
  steals: Steal[];
}

export interface RevealView {
  trackId: TrackId;
  title: string;
  artists: string[];
  year: number;
  outcome: Outcome;
}

export interface GameView {
  phase: Phase;
  settings: Settings;
  teams: TeamView[];
  turnOrder: TeamId[];
  turn: TurnView | null;
  reveal: RevealView | null;
  deckRemaining: number;
  winnerIds: TeamId[];
  viewerTeamId: TeamId | null;
}

const UNKNOWN: TrackMeta = { title: 'Unknown', artists: [] };

/** The only way game state leaves the host. Never includes the current track before the reveal. */
export function toView(state: GameState, meta: Record<TrackId, TrackMeta>, viewerTeamId: TeamId | null): GameView {
  const m = (id: TrackId) => meta[id] ?? UNKNOWN;
  const revealing = state.phase === 'reveal' || (state.phase === 'finished' && state.lastOutcome !== null);
  const o = state.lastOutcome;
  return {
    phase: state.phase,
    settings: { ...state.settings },
    teams: state.teams.map((t) => ({
      id: t.id,
      name: t.name,
      playerIds: [...t.playerIds],
      tokens: t.tokens,
      timeline: t.timeline.map((c) => ({ trackId: c.trackId, year: c.year, ...m(c.trackId) })),
    })),
    turnOrder: [...state.turnOrder],
    turn: state.turn
      ? { teamId: state.turn.teamId, slot: state.turn.slot, steals: state.turn.steals.map((s) => ({ ...s })) }
      : null,
    reveal:
      revealing && o
        ? { trackId: o.trackId, year: state.years[o.trackId], ...m(o.trackId), outcome: { ...o } }
        : null,
    deckRemaining: state.deck.length,
    winnerIds: [...state.winnerIds],
    viewerTeamId,
  };
}
```

Note: a game that finishes by a `buy` keeps the previous `lastOutcome` (already public), so showing it is not a leak.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/host/view.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/host
git commit -m "feat(host): filtered game view that hides the current track until reveal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Host runtime (intents, timers, persistence)

**Files:**
- Create: `src/host/runtime.ts`
- Test: `src/host/runtime.test.ts`

**Interfaces:**
- Consumes: `apply` (Task 3+), `matchesGuess`/`Guess` (Task 7), `toView`/`GameView`/`TrackMeta` (Task 9).
- Produces (used by Plan 2's `net/` and `ui/`):
  - `type GuestIntent = { type: 'place'; slot: number } | { type: 'skip' } | { type: 'lockIn'; guess?: Guess } | { type: 'steal'; slot: number } | { type: 'buy' }`
  - `type HostCommand = { type: 'trackFailed' } | { type: 'passTurn' } | { type: 'nextTurn' }`
  - `type IntentResult = { ok: true } | { ok: false; reason: string }`
  - `interface RuntimeDeps { meta: Record<TrackId, TrackMeta>; stealWindowMs: number; revealMs: number; setTimer: (fn: () => void, ms: number) => () => void; onChange: (state: GameState) => void }`
  - `class HostRuntime { constructor(state: GameState, players: Record<string, TeamId>, deps: RuntimeDeps); get state(): GameState; viewFor(playerId: string | null): GameView; handleIntent(playerId: string, intent: GuestIntent): IntentResult; command(cmd: HostCommand): IntentResult; serialize(): string; static restore(json: string, deps: RuntimeDeps): HostRuntime; dispose(): void }`
  - Behaviour: after a successful `lockIn`, arms a `stealWindowMs` timer that applies `closeSteals`; after a reveal, arms a `revealMs` timer that applies `nextTurn`. `onChange` fires after every successful state change (Plan 2 broadcasts views and persists `serialize()` there). `restore` re-arms the timer that matches the restored phase.

- [ ] **Step 1: Write the failing test** — `src/host/runtime.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { newGame } from '../engine/testkit';
import type { GameState } from '../engine/types';
import { HostRuntime, type RuntimeDeps } from './runtime';

const PLAYERS = { p1: 'A', p2: 'B', p3: 'C' };

function fakeDeps() {
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const changes: GameState[] = [];
  const deps: RuntimeDeps = {
    meta: { t1: { title: 'Smells Like Teen Spirit', artists: ['Nirvana'] } },
    stealWindowMs: 5000,
    revealMs: 5000,
    setTimer: (fn, ms) => {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
    onChange: (s) => changes.push(s),
  };
  const fire = () => {
    const t = timers.filter((x) => !x.cancelled).shift();
    if (!t) throw new Error('no pending timer');
    t.cancelled = true;
    t.fn();
  };
  const pending = () => timers.filter((x) => !x.cancelled).map((x) => x.ms);
  return { deps, timers, changes, fire, pending };
}

describe('HostRuntime', () => {
  it('maps players to teams and rejects unknown players', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.handleIntent('p2', { type: 'place', slot: 1 })).toEqual({ ok: true });
    expect(rt.handleIntent('p1', { type: 'place', slot: 0 })).toEqual({ ok: false, reason: 'not your turn' });
    expect(rt.handleIntent('nobody', { type: 'skip' })).toEqual({ ok: false, reason: 'unknown player' });
  });

  it('notifies on every successful change only', () => {
    const { deps, changes } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p1', { type: 'place', slot: 0 });
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    expect(changes).toHaveLength(1);
  });

  it('awards the naming bonus via the fuzzy matcher', () => {
    const { deps, fire } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 0 });
    rt.handleIntent('p2', { type: 'lockIn', guess: { title: 'smells like teen sprit', artist: 'nirvana' } });
    fire(); // close steals
    expect(rt.state.lastOutcome?.nameBonus).toBe(true);
    expect(rt.state.teams.find((t) => t.id === 'B')?.tokens).toBe(3);
  });

  it('gives no bonus without a guess', () => {
    const { deps, fire } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.state.lastOutcome?.nameBonus).toBe(false);
  });

  it('runs the steal window then the reveal, then the next turn', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    expect(rt.state.phase).toBe('stealWindow');
    expect(pending()).toEqual([5000]);
    expect(rt.handleIntent('p3', { type: 'steal', slot: 0 })).toEqual({ ok: true });
    fire();
    expect(rt.state.phase).toBe('reveal');
    expect(pending()).toEqual([5000]);
    fire();
    expect(rt.state.phase).toBe('deciding');
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('does not arm a reveal timer when the game finishes', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame({ cardsToWin: 2 }), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.state.phase).toBe('finished');
    expect(pending()).toEqual([]);
  });

  it('host commands bypass player mapping', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.command({ type: 'passTurn' })).toEqual({ ok: true });
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('nextTurn command cancels the pending reveal timer', () => {
    const { deps, fire, pending } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    fire();
    expect(rt.command({ type: 'nextTurn' })).toEqual({ ok: true });
    expect(pending()).toEqual([]);
    expect(rt.state.turn?.teamId).toBe('C');
  });

  it('builds per-player views', () => {
    const { deps } = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, deps);
    expect(rt.viewFor('p3').viewerTeamId).toBe('C');
    expect(rt.viewFor(null).viewerTeamId).toBeNull();
    expect(JSON.stringify(rt.viewFor('p2'))).not.toContain('Smells Like Teen Spirit');
  });

  it('restores from serialize() and re-arms the steal timer after a host reload', () => {
    const a = fakeDeps();
    const rt = new HostRuntime(newGame(), PLAYERS, a.deps);
    rt.handleIntent('p2', { type: 'place', slot: 1 });
    rt.handleIntent('p2', { type: 'lockIn' });
    const saved = rt.serialize();
    rt.dispose();
    expect(a.pending()).toEqual([]);

    const b = fakeDeps();
    const restored = HostRuntime.restore(saved, b.deps);
    expect(restored.state.phase).toBe('stealWindow');
    expect(b.pending()).toEqual([5000]);
    b.fire();
    expect(restored.state.phase).toBe('reveal');
    expect(restored.handleIntent('p2', { type: 'skip' })).toEqual({ ok: false, reason: 'not allowed during reveal' });
  });

  it('restore rejects garbage', () => {
    expect(() => HostRuntime.restore('{"nope":1}', fakeDeps().deps)).toThrow('invalid saved game');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/host/runtime.test.ts`
Expected: FAIL — cannot resolve `./runtime`.

- [ ] **Step 3: Write `src/host/runtime.ts`**

```ts
import { apply } from '../engine/game';
import type { Action, GameState, TeamId, TrackId } from '../engine/types';
import { matchesGuess, type Guess } from '../match/match';
import { toView, type GameView, type TrackMeta } from './view';

export type GuestIntent =
  | { type: 'place'; slot: number }
  | { type: 'skip' }
  | { type: 'lockIn'; guess?: Guess }
  | { type: 'steal'; slot: number }
  | { type: 'buy' };

export type HostCommand = { type: 'trackFailed' } | { type: 'passTurn' } | { type: 'nextTurn' };

export type IntentResult = { ok: true } | { ok: false; reason: string };

export interface RuntimeDeps {
  meta: Record<TrackId, TrackMeta>;
  stealWindowMs: number;
  revealMs: number;
  /** Schedules `fn` after `ms`; returns a cancel function. */
  setTimer: (fn: () => void, ms: number) => () => void;
  onChange: (state: GameState) => void;
}

interface Saved {
  v: 1;
  state: GameState;
  players: Record<string, TeamId>;
}

export class HostRuntime {
  private cancelTimer: (() => void) | null = null;

  constructor(
    private current: GameState,
    private readonly players: Record<string, TeamId>,
    private readonly deps: RuntimeDeps,
  ) {
    this.armTimerForPhase();
  }

  get state(): GameState {
    return this.current;
  }

  viewFor(playerId: string | null): GameView {
    const teamId = playerId === null ? null : (this.players[playerId] ?? null);
    return toView(this.current, this.deps.meta, teamId);
  }

  handleIntent(playerId: string, intent: GuestIntent): IntentResult {
    const teamId = this.players[playerId];
    if (teamId === undefined) return { ok: false, reason: 'unknown player' };
    return this.dispatch(this.toAction(teamId, intent));
  }

  command(cmd: HostCommand): IntentResult {
    return this.dispatch(cmd);
  }

  serialize(): string {
    const saved: Saved = { v: 1, state: this.current, players: this.players };
    return JSON.stringify(saved);
  }

  static restore(json: string, deps: RuntimeDeps): HostRuntime {
    const saved = JSON.parse(json) as Partial<Saved>;
    if (saved.v !== 1 || !saved.state || !saved.players) throw new Error('invalid saved game');
    return new HostRuntime(saved.state, saved.players, deps);
  }

  dispose(): void {
    this.clearTimer();
  }

  private toAction(teamId: TeamId, intent: GuestIntent): Action {
    switch (intent.type) {
      case 'place':
        return { type: 'place', teamId, slot: intent.slot };
      case 'skip':
        return { type: 'skip', teamId };
      case 'steal':
        return { type: 'steal', teamId, slot: intent.slot };
      case 'buy':
        return { type: 'buy', teamId };
      case 'lockIn':
        return { type: 'lockIn', teamId, nameCorrect: this.isNameCorrect(intent.guess) };
    }
  }

  private isNameCorrect(guess: Guess | undefined): boolean {
    const turn = this.current.turn;
    if (!guess || !turn) return false;
    const meta = this.deps.meta[turn.trackId];
    return meta ? matchesGuess(guess, meta) : false;
  }

  private dispatch(action: Action): IntentResult {
    const before = this.current.phase;
    const result = apply(this.current, action);
    if (!result.ok) return { ok: false, reason: result.reason };
    this.current = result.state;
    if (this.current.phase !== before) this.armTimerForPhase();
    this.deps.onChange(this.current);
    return { ok: true };
  }

  private armTimerForPhase(): void {
    this.clearTimer();
    const phase = this.current.phase;
    if (phase === 'stealWindow') {
      this.cancelTimer = this.deps.setTimer(() => this.onTimer({ type: 'closeSteals' }), this.deps.stealWindowMs);
    } else if (phase === 'reveal') {
      this.cancelTimer = this.deps.setTimer(() => this.onTimer({ type: 'nextTurn' }), this.deps.revealMs);
    }
  }

  private onTimer(action: Action): void {
    this.cancelTimer = null;
    this.dispatch(action); // a rejection here (e.g. game already finished by a buy) is harmless
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }
}
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `npm run typecheck && npm test`
Expected: all suites PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/host
git commit -m "feat(host): runtime with player mapping, naming bonus, timers and persistence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/core-engine
```

Expected: CI workflow runs on the pushed branch and passes (check with `gh run list --branch feat/core-engine --limit 1` using `GH_TOKEN=$(gh auth token -u k3rmitt)`).
