# TUBESTER Real Music & Ship (Plan 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play real songs: the host logs in with Spotify, imports one of their playlists, reviews MusicBrainz-corrected years, plays tracks with the Web Playback SDK in the game tab, and broadcasts that tab's audio to every phone; then deploy the app to GitHub Pages.

**Architecture:** New pure, unit-tested modules: PKCE helpers and `SpotifyAuth` (tokens in localStorage, refresh), `SpotifyApi` (playlists, playlist items, play/pause with one 401 retry), `SpotifyMusicSource` (wraps an injected SDK player behind `MusicSource`), `MusicRouter` (switches the session between demo tones and Spotify), a year-review model, a MusicBrainz lookup wired through the existing rate limiter and cache, and `pickAudioTrack` for tab capture. Browser-only glue (SDK script loader, `getDisplayMedia`, React hook and screens) is thin and verified by the existing Playwright suite (demo path) plus a written manual checklist (Spotify path cannot run in CI: it needs a Premium login).

**Tech Stack:** As Plan 2 (TypeScript 7, React 19, Vite 8, Vitest 5, Biome, Playwright). Spotify Web API + Web Playback SDK (`https://sdk.scdn.co/spotify-player.js`), MusicBrainz WS/2, GitHub Pages via `actions/deploy-pages`.

**Spec:** `docs/superpowers/specs/2026-11-01-tubester-design.md` (sections 1, 4 Spotify/Broadcast, 3 Setup, 7 delivery).

## Spotify facts this plan relies on (checked 2026-11-02)

From Spotify's February 2026 Development Mode migration guide and March 2026 changelog:
- The **app owner must have Premium**; Development Mode allows **5 users** (allowlisted in the dashboard). Only the host logs in, so 5 possible hosts; guests never touch Spotify.
- Playlist contents come from **`GET /v1/playlists/{id}/items`** (renamed from `/tracks`); each entry's track is under **`item`** (was `track`); playlist objects expose **`items.total`** (was `tracks.total`). Contents are returned **only for playlists the user owns or collaborates on**.
- `GET /me` still returns `id` (but no longer `product`, so Premium can't be pre-checked; the SDK's `account_error` tells us).
- `external_ids` (ISRC) on tracks was removed then **reverted**; the code still treats ISRC as optional.
- No change to `PUT /me/player/play`, `PUT /me/player/pause` or the Web Playback SDK. Required scopes: `streaming user-read-email user-read-private user-modify-playback-state playlist-read-private playlist-read-collaborative`.
- Redirect URIs must be exact; loopback must use `http://127.0.0.1:<port>` (not `localhost`).

## Global Constraints

- Brand **TUBESTER**, steal button **"TUBESTER!"**, never "Hitster".
- Spotify is an implementation detail behind `MusicSource`; demo tones stay available (and stay the e2e path).
- Only the host needs Spotify Premium; guests need nothing but the link.
- The host never sees the current track: the SDK's track metadata is never rendered; titles only leave the host through `HostRuntime.viewFor` after the reveal.
- Client id comes from `VITE_SPOTIFY_CLIENT_ID` (public, not a secret). Without it, the Spotify option is hidden.
- Years: earliest of MusicBrainz and Spotify; host can edit or exclude in the review screen; reviewed list survives page reloads (localStorage).
- Host browser: desktop Chrome/Edge (SDK + tab-audio capture).
- Git: branch `feat/spotify` from `docs/plan-3-spotify`; never commit on `main`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push as `k3rmitt`.
- Lint is Biome (`npm run lint`); typecheck `tsc` 7.

## Decision for the user to confirm with this plan

- **Spec says "capture ended → game pauses".** This plan instead keeps the game running and shows a **Resume broadcast** banner on the host (the host can also **Pass turn**). Pausing would need a pause feature in the rules engine's timers; it can be added later if wanted.

## Review Focus

1. **Spotify login round-trip** — returning from Spotify (`?code&state`) must land on the host screen, exchange the code once, and clean the URL; a mismatched/missing state or `error=access_denied` shows a clear message, never a blank page. Tests in Tasks 1 and 6.
2. **Token expiry mid-game** — an access token expiring during a long game is refreshed transparently (also on a surprise 401), and two calls at once trigger only one refresh. Tests in Tasks 1 and 2.
3. **Playlists the API won't open** — followed/editorial playlists are filtered out of the picker; local files, podcast episodes and tracks without a usable release year are skipped on import. Tests in Task 2.
4. **Player not ready yet / Premium missing** — a `play` issued before the SDK device is ready waits for it; a non-Premium account surfaces "Spotify Premium is required to host" instead of silently skipping tracks. Tests in Task 3.
5. **Host shares the wrong thing** — sharing a window or a tab without ticking "Also share tab audio" produces a clear error and no broadcast. Test in Task 5.

---

## File Structure

```
src/util/http.ts                    HttpFetch, HttpError, browserFetch, scriptedFetch (test helper)
src/music/spotify/pkce.ts           SPOTIFY_SCOPES, randomString, challengeFor, authorizeUrl
src/music/spotify/auth.ts           SpotifyAuth (login, callback, tokens, refresh)
src/music/spotify/api.ts            SpotifyApi (me, playlists, playlist items, play, pause)
src/music/spotify/source.ts         SpotifyMusicSource, SdkPlayer
src/music/spotify/sdk.ts            loadSpotifySdk, createSpotifyPlayer (browser only)
src/music/router.ts                 MusicRouter
src/years/lookup.ts                 createYearLookup
src/host/review.ts                  review rows model
src/host/broadcast.ts               pickAudioTrack, captureTabAudio, NoTabAudioError
src/ui/router.ts                    + OAuth return detection
src/ui/useSpotify.ts                React hook: login, playlists, import, review rows, player
src/ui/MusicPanel.tsx               music source choice + Spotify steps + broadcast button
src/ui/YearReview.tsx               review table
src/ui/HostLobby.tsx, HostApp.tsx   integration
src/ui/theme.css                    + choice, table styles
.github/workflows/deploy.yml        GitHub Pages deploy
docs/spotify-setup.md, docs/manual-test.md
```

---

### Task 1: HTTP helpers, PKCE and SpotifyAuth

**Files:**
- Create: `src/util/http.ts`, `src/music/spotify/pkce.ts`, `src/music/spotify/auth.ts`
- Test: `src/music/spotify/pkce.test.ts`, `src/music/spotify/auth.test.ts`

**Interfaces:**
- Consumes: `KeyValueStorage`, `memoryStorage` (Plan 2).
- Produces:
  - `interface HttpInit { method?: string; headers?: Record<string, string>; body?: string }`, `interface HttpResponse { ok: boolean; status: number; json(): Promise<unknown> }`, `type HttpFetch = (url: string, init?: HttpInit) => Promise<HttpResponse>`
  - `class HttpError extends Error { readonly status: number }`, `browserFetch: HttpFetch`
  - `scriptedFetch(responses: { status: number; body?: unknown }[]): { fetchFn: HttpFetch; calls: { url: string; init?: HttpInit }[] }` (test helper)
  - `SPOTIFY_SCOPES: string[]`, `randomString(length, fill?)`, `challengeFor(verifier): Promise<string>`, `authorizeUrl({ clientId, redirectUri, challenge, state }): string`
  - `TOKENS_KEY = 'tubester.spotify.tokens'`, `PKCE_KEY = 'tubester.spotify.pkce'`, `interface Tokens { accessToken; refreshToken; expiresAt }`, `class NotLoggedInError`
  - `class SpotifyAuth { constructor({ clientId, redirectUri, storage, fetchFn, now?, random? }); isLoggedIn(): boolean; beginLogin(): Promise<string>; completeLogin(search: string): Promise<boolean>; accessToken(): Promise<string>; forceRefresh(): Promise<string>; logout(): void }`

- [ ] **Step 1: Create the branch**

```bash
cd /Users/herve.bourzeix/dev/perso/tubester
git fetch origin
git checkout -b feat/spotify origin/docs/plan-3-spotify
```

- [ ] **Step 2: Write `src/util/http.ts`** (types and a test double; behaviour is exercised by the auth/api tests)

```ts
export interface HttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HttpFetch = (url: string, init?: HttpInit) => Promise<HttpResponse>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const browserFetch: HttpFetch = (url, init) => fetch(url, init);

/** Test helper: answers calls in order with the scripted responses and records them. */
export function scriptedFetch(responses: { status: number; body?: unknown }[]) {
  const calls: { url: string; init?: HttpInit }[] = [];
  const queue = [...responses];
  const fetchFn: HttpFetch = async (url, init) => {
    calls.push({ url, init });
    const r = queue.shift();
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fetchFn, calls };
}
```

- [ ] **Step 3: Write the failing tests**

`src/music/spotify/pkce.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { authorizeUrl, challengeFor, randomString, SPOTIFY_SCOPES } from './pkce';

describe('pkce', () => {
  it('derives the S256 challenge (RFC 7636 example)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes random strings from the PKCE alphabet', () => {
    expect(randomString(64)).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(randomString(4, (a) => a.map((_, i) => i))).toBe('ABCD');
  });

  it('builds the authorize URL', () => {
    const url = new URL(authorizeUrl({ clientId: 'cid', redirectUri: 'https://x.test/tubester/', challenge: 'ch', state: 'st' }));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: 'https://x.test/tubester/',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
      scope: SPOTIFY_SCOPES.join(' '),
      state: 'st',
    });
    expect(SPOTIFY_SCOPES).toContain('streaming');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
  });
});
```

`src/music/spotify/auth.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { scriptedFetch } from '../../util/http';
import { memoryStorage } from '../../util/storage';
import { NotLoggedInError, PKCE_KEY, SpotifyAuth, TOKENS_KEY } from './auth';
import { challengeFor } from './pkce';

const REDIRECT = 'https://k3rmitt.github.io/tubester/';

function setup(responses: { status: number; body?: unknown }[] = [], start = 1_000_000) {
  const storage = memoryStorage();
  const { fetchFn, calls } = scriptedFetch(responses);
  let now = start;
  const auth = new SpotifyAuth({ clientId: 'cid', redirectUri: REDIRECT, storage, fetchFn, now: () => now });
  return { auth, storage, calls, advance: (ms: number) => (now += ms) };
}

function form(body: string | undefined) {
  return Object.fromEntries(new URLSearchParams(body ?? ''));
}

async function loggedIn(extra: { status: number; body?: unknown }[] = []) {
  const s = setup([{ status: 200, body: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 } }, ...extra]);
  const url = new URL(await s.auth.beginLogin());
  await s.auth.completeLogin(`?code=c1&state=${url.searchParams.get('state')}`);
  return s;
}

describe('SpotifyAuth login', () => {
  it('stores a verifier and returns an authorize URL with its challenge', async () => {
    const { auth, storage } = setup();
    const url = new URL(await auth.beginLogin());
    const pending = JSON.parse(storage.getItem(PKCE_KEY) ?? '{}');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('code_challenge')).toBe(await challengeFor(pending.verifier));
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
  });

  it('ignores URLs that are not a login callback', async () => {
    expect(await setup().auth.completeLogin('')).toBe(false);
  });

  it('exchanges the code once and keeps the tokens', async () => {
    const { auth, storage, calls } = await loggedIn();
    expect(auth.isLoggedIn()).toBe(true);
    expect(storage.getItem(PKCE_KEY)).toBeNull();
    expect(calls[0].url).toBe('https://accounts.spotify.com/api/token');
    expect(calls[0].init?.method).toBe('POST');
    expect(form(calls[0].init?.body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c1',
      redirect_uri: REDIRECT,
      client_id: 'cid',
    });
    expect(form(calls[0].init?.body).code_verifier).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(await auth.accessToken()).toBe('a1');
  });

  it('rejects a callback whose state does not match', async () => {
    const { auth } = setup();
    await auth.beginLogin();
    await expect(auth.completeLogin('?code=c1&state=forged')).rejects.toThrow('Spotify login expired, please try again');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('explains a cancelled login', async () => {
    const { auth } = setup();
    const url = new URL(await auth.beginLogin());
    await expect(auth.completeLogin(`?error=access_denied&state=${url.searchParams.get('state')}`)).rejects.toThrow(
      'Spotify login was cancelled',
    );
  });
});

describe('SpotifyAuth tokens', () => {
  it('throws when not logged in', async () => {
    await expect(setup().auth.accessToken()).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it('refreshes a token about to expire and keeps the old refresh token when none is returned', async () => {
    const s = await loggedIn([{ status: 200, body: { access_token: 'a2', expires_in: 3600 } }]);
    s.advance(3600_000 - 30_000);
    expect(await s.auth.accessToken()).toBe('a2');
    expect(form(s.calls[1].init?.body)).toEqual({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'cid' });
    expect(JSON.parse(s.storage.getItem(TOKENS_KEY) ?? '{}').refreshToken).toBe('r1');
  });

  it('shares one refresh between concurrent callers', async () => {
    const s = await loggedIn([{ status: 200, body: { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 } }]);
    const [x, y] = await Promise.all([s.auth.forceRefresh(), s.auth.forceRefresh()]);
    expect([x, y]).toEqual(['a2', 'a2']);
    expect(s.calls).toHaveLength(2);
  });

  it('logs out when Spotify rejects the refresh token, but not on a server error', async () => {
    const down = await loggedIn([{ status: 503 }]);
    await expect(down.auth.forceRefresh()).rejects.toThrow('503');
    expect(down.auth.isLoggedIn()).toBe(true);
    const revoked = await loggedIn([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(revoked.auth.forceRefresh()).rejects.toThrow('400');
    expect(revoked.auth.isLoggedIn()).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/music/spotify`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement**

`src/music/spotify/pkce.ts`:
```ts
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
];

export function randomString(
  length: number,
  fill: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a),
): string {
  return Array.from(fill(new Uint8Array(length)), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: p.challenge,
    scope: SPOTIFY_SCOPES.join(' '),
    state: p.state,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}
```

`src/music/spotify/auth.ts`:
```ts
import { type HttpFetch, HttpError } from '../../util/http';
import type { KeyValueStorage } from '../../util/storage';
import { authorizeUrl, challengeFor, randomString } from './pkce';

export const TOKENS_KEY = 'tubester.spotify.tokens';
export const PKCE_KEY = 'tubester.spotify.pkce';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const EARLY_REFRESH_MS = 60_000;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class NotLoggedInError extends Error {
  constructor() {
    super('Not logged in to Spotify');
  }
}

export interface SpotifyAuthDeps {
  clientId: string;
  redirectUri: string;
  storage: KeyValueStorage;
  fetchFn: HttpFetch;
  now?: () => number;
  random?: (a: Uint8Array) => Uint8Array;
}

/** Authorization Code with PKCE: no client secret, tokens kept in localStorage. */
export class SpotifyAuth {
  private refreshing: Promise<string> | null = null;

  constructor(private readonly deps: SpotifyAuthDeps) {}

  isLoggedIn(): boolean {
    return this.tokens() !== null;
  }

  async beginLogin(): Promise<string> {
    const verifier = randomString(64, this.deps.random);
    const state = randomString(16, this.deps.random);
    this.deps.storage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
    return authorizeUrl({
      clientId: this.deps.clientId,
      redirectUri: this.deps.redirectUri,
      challenge: await challengeFor(verifier),
      state,
    });
  }

  /** Handles Spotify's redirect (`?code=…&state=…`). Returns false when the URL is not a login callback. */
  async completeLogin(search: string): Promise<boolean> {
    const q = new URLSearchParams(search);
    const state = q.get('state');
    if (!state) return false;
    const raw = this.deps.storage.getItem(PKCE_KEY);
    this.deps.storage.removeItem(PKCE_KEY);
    const error = q.get('error');
    if (error) throw new Error(error === 'access_denied' ? 'Spotify login was cancelled' : `Spotify login failed: ${error}`);
    const pending = raw ? (JSON.parse(raw) as { verifier?: string; state?: string }) : null;
    const code = q.get('code');
    if (!pending?.verifier || pending.state !== state || !code) throw new Error('Spotify login expired, please try again');
    const body = await this.post({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.deps.redirectUri,
      client_id: this.deps.clientId,
      code_verifier: pending.verifier,
    });
    this.save(this.parse(body, null));
    return true;
  }

  async accessToken(): Promise<string> {
    const t = this.tokens();
    if (!t) throw new NotLoggedInError();
    if (t.expiresAt - EARLY_REFRESH_MS > this.now()) return t.accessToken;
    return this.forceRefresh();
  }

  forceRefresh(): Promise<string> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  logout(): void {
    this.deps.storage.removeItem(TOKENS_KEY);
  }

  private async refresh(): Promise<string> {
    const t = this.tokens();
    if (!t) throw new NotLoggedInError();
    let body: unknown;
    try {
      body = await this.post({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: this.deps.clientId });
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) this.logout();
      throw e;
    }
    const next = this.parse(body, t.refreshToken);
    this.save(next);
    return next.accessToken;
  }

  private async post(params: Record<string, string>): Promise<unknown> {
    const res = await this.deps.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) throw new HttpError(res.status, `Spotify token request failed (${res.status})`);
    return res.json();
  }

  private parse(body: unknown, previousRefresh: string | null): Tokens {
    const b = (body ?? {}) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    if (typeof b.access_token !== 'string') throw new Error('Spotify returned no access token');
    const refreshToken = typeof b.refresh_token === 'string' ? b.refresh_token : previousRefresh;
    if (!refreshToken) throw new Error('Spotify returned no refresh token');
    const expiresIn = typeof b.expires_in === 'number' ? b.expires_in : 3600;
    return { accessToken: b.access_token, refreshToken, expiresAt: this.now() + expiresIn * 1000 };
  }

  private tokens(): Tokens | null {
    try {
      const t = JSON.parse(this.deps.storage.getItem(TOKENS_KEY) ?? 'null') as Partial<Tokens> | null;
      if (t && typeof t.accessToken === 'string' && typeof t.refreshToken === 'string' && typeof t.expiresAt === 'number') {
        return t as Tokens;
      }
    } catch {
      // corrupt: treat as logged out
    }
    return null;
  }

  private save(t: Tokens): void {
    this.deps.storage.setItem(TOKENS_KEY, JSON.stringify(t));
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
```

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `npx vitest run src/music/spotify && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add src/util/http.ts src/music/spotify
git commit -m "feat(spotify): PKCE login and token refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Spotify Web API client

**Files:**
- Create: `src/music/spotify/api.ts`
- Test: `src/music/spotify/api.test.ts`

**Interfaces:**
- Consumes: `HttpFetch`, `HttpError`, `scriptedFetch` (Task 1); `Track`, `PlaylistSummary` (Plan 1).
- Produces:
  - `interface TokenSource { accessToken(): Promise<string>; forceRefresh(): Promise<string> }` (SpotifyAuth satisfies it)
  - `class SpotifyApi { constructor(auth: TokenSource, fetchFn: HttpFetch); me(): Promise<{ id: string }>; listPlaylists(): Promise<PlaylistSummary[]>; loadPlaylist(id: string): Promise<Track[]>; play(deviceId: string, trackId: string): Promise<void>; pause(deviceId: string): Promise<void> }`
  - `listPlaylists` keeps only playlists the user owns or collaborates on; `loadPlaylist` reads `GET /playlists/{id}/items`, accepts `item` (current) or `track` (legacy), skips local files, non-tracks, missing ids and years < 1900, dedupes by id. Errors are `HttpError` with Spotify's message when present.

- [ ] **Step 1: Write the failing test** — `src/music/spotify/api.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { HttpError, scriptedFetch } from '../../util/http';
import { SpotifyApi } from './api';

function setup(responses: { status: number; body?: unknown }[]) {
  const { fetchFn, calls } = scriptedFetch(responses);
  let token = 'tok';
  let refreshes = 0;
  const auth = {
    accessToken: async () => token,
    forceRefresh: async () => {
      refreshes++;
      token = 'tok2';
      return token;
    },
  };
  return { api: new SpotifyApi(auth, fetchFn), calls, refreshes: () => refreshes };
}

const track = (id: string, name: string, date: string, extra: Record<string, unknown> = {}) => ({
  type: 'track',
  id,
  name,
  artists: [{ name: 'Artist' }],
  album: { release_date: date },
  external_ids: { isrc: `ISRC${id}` },
  is_local: false,
  ...extra,
});

describe('SpotifyApi.listPlaylists', () => {
  it('lists only playlists the user owns or collaborates on, across pages', async () => {
    const { api, calls } = setup([
      { status: 200, body: { id: 'me' } },
      {
        status: 200,
        body: {
          items: [
            { id: 'p1', name: 'Mine', owner: { id: 'me' }, collaborative: false, items: { total: 12 } },
            { id: 'p2', name: 'Followed', owner: { id: 'spotify' }, collaborative: false, items: { total: 50 } },
          ],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
        },
      },
      { status: 200, body: { items: [{ id: 'p3', name: 'Shared', owner: { id: 'x' }, collaborative: true, tracks: { total: 3 } }], next: null } },
    ]);
    expect(await api.listPlaylists()).toEqual([
      { id: 'p1', name: 'Mine', trackCount: 12 },
      { id: 'p3', name: 'Shared', trackCount: 3 },
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.spotify.com/v1/me',
      'https://api.spotify.com/v1/me/playlists?limit=50',
      'https://api.spotify.com/v1/me/playlists?offset=50&limit=50',
    ]);
    expect(calls[0].init?.headers?.Authorization).toBe('Bearer tok');
  });
});

describe('SpotifyApi.loadPlaylist', () => {
  it('maps playlist items to tracks, skipping what cannot be played or dated', async () => {
    const { api, calls } = setup([
      {
        status: 200,
        body: {
          items: [
            { item: track('t1', 'Bohemian Rhapsody', '1975-10-31') },
            { item: track('t2', 'Local', '2001', { is_local: true }) },
            { item: { type: 'episode', id: 'e1', name: 'Podcast' } },
            { item: track('t3', 'No date', '0000') },
            { item: null },
            { track: track('t4', 'Legacy shape', '1991') },
          ],
          next: 'https://api.spotify.com/v1/playlists/p1/items?offset=100&limit=100',
        },
      },
      { status: 200, body: { items: [{ item: track('t1', 'Bohemian Rhapsody', '1975-10-31') }, { item: track('t5', 'No ISRC', '2003', { external_ids: {} }) }], next: null } },
    ]);
    expect(await api.loadPlaylist('p1')).toEqual([
      { id: 't1', title: 'Bohemian Rhapsody', artists: ['Artist'], isrc: 'ISRCt1', sourceYear: 1975 },
      { id: 't4', title: 'Legacy shape', artists: ['Artist'], isrc: 'ISRCt4', sourceYear: 1991 },
      { id: 't5', title: 'No ISRC', artists: ['Artist'], isrc: undefined, sourceYear: 2003 },
    ]);
    expect(calls[0].url).toBe('https://api.spotify.com/v1/playlists/p1/items?limit=100&additional_types=track');
  });
});

describe('SpotifyApi requests', () => {
  it('refreshes once on a 401 and retries', async () => {
    const { api, calls, refreshes } = setup([{ status: 401 }, { status: 200, body: { id: 'me' } }]);
    expect(await api.me()).toEqual({ id: 'me' });
    expect(refreshes()).toBe(1);
    expect(calls[1].init?.headers?.Authorization).toBe('Bearer tok2');
  });

  it('gives up after a second 401', async () => {
    const { api } = setup([{ status: 401 }, { status: 401 }]);
    await expect(api.me()).rejects.toBeInstanceOf(HttpError);
  });

  it("surfaces Spotify's error message", async () => {
    const { api } = setup([{ status: 403, body: { error: { status: 403, message: 'User not registered in the Developer Dashboard' } } }]);
    await expect(api.me()).rejects.toThrow('User not registered in the Developer Dashboard');
  });

  it('starts a track on a device and pauses it', async () => {
    const { api, calls } = setup([{ status: 204 }, { status: 204 }]);
    await api.play('dev 1', 't1');
    await api.pause('dev 1');
    expect(calls[0]).toMatchObject({
      url: 'https://api.spotify.com/v1/me/player/play?device_id=dev%201',
      init: { method: 'PUT', body: JSON.stringify({ uris: ['spotify:track:t1'] }) },
    });
    expect(calls[1]).toMatchObject({ url: 'https://api.spotify.com/v1/me/player/pause?device_id=dev%201', init: { method: 'PUT' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/music/spotify/api.test.ts`
Expected: FAIL — cannot resolve `./api`.

- [ ] **Step 3: Write `src/music/spotify/api.ts`**

```ts
import { type HttpFetch, HttpError } from '../../util/http';
import type { PlaylistSummary, Track } from '../types';

const BASE = 'https://api.spotify.com/v1';

export interface TokenSource {
  accessToken(): Promise<string>;
  forceRefresh(): Promise<string>;
}

interface Page<T> {
  items?: T[];
  next?: string | null;
}

interface ApiPlaylist {
  id?: string;
  name?: string;
  collaborative?: boolean;
  owner?: { id?: string };
  items?: { total?: number };
  tracks?: { total?: number };
}

interface ApiTrack {
  type?: string;
  id?: string | null;
  name?: string;
  is_local?: boolean;
  artists?: { name?: string }[];
  album?: { release_date?: string };
  external_ids?: { isrc?: string };
}

export class SpotifyApi {
  constructor(
    private readonly auth: TokenSource,
    private readonly fetchFn: HttpFetch,
  ) {}

  async me(): Promise<{ id: string }> {
    const body = (await this.request('GET', '/me')) as { id?: string } | null;
    if (!body?.id) throw new Error('Spotify returned no user id');
    return { id: body.id };
  }

  /** Only playlists whose contents the API will return: owned or collaborative. */
  async listPlaylists(): Promise<PlaylistSummary[]> {
    const { id: me } = await this.me();
    const out: PlaylistSummary[] = [];
    for await (const p of this.pages<ApiPlaylist>('/me/playlists?limit=50')) {
      if (!p.id || !p.name) continue;
      if (p.owner?.id !== me && !p.collaborative) continue;
      out.push({ id: p.id, name: p.name, trackCount: p.items?.total ?? p.tracks?.total ?? 0 });
    }
    return out;
  }

  async loadPlaylist(id: string): Promise<Track[]> {
    const out: Track[] = [];
    const seen = new Set<string>();
    const path = `/playlists/${encodeURIComponent(id)}/items?limit=100&additional_types=track`;
    for await (const entry of this.pages<{ item?: ApiTrack | null; track?: ApiTrack | null }>(path)) {
      const t = entry.item ?? entry.track;
      if (!t || t.type !== 'track' || t.is_local || !t.id || !t.name || seen.has(t.id)) continue;
      const year = Number.parseInt((t.album?.release_date ?? '').slice(0, 4), 10);
      if (!Number.isFinite(year) || year < 1900) continue;
      seen.add(t.id);
      out.push({
        id: t.id,
        title: t.name,
        artists: (t.artists ?? []).map((a) => a.name ?? '').filter(Boolean),
        isrc: t.external_ids?.isrc,
        sourceYear: year,
      });
    }
    return out;
  }

  async play(deviceId: string, trackId: string): Promise<void> {
    await this.request('PUT', `/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      uris: [`spotify:track:${trackId}`],
    });
  }

  async pause(deviceId: string): Promise<void> {
    await this.request('PUT', `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`);
  }

  private async *pages<T>(first: string): AsyncGenerator<T> {
    let next: string | null | undefined = first;
    while (next) {
      const page = (await this.request('GET', next)) as Page<T> | null;
      for (const item of page?.items ?? []) yield item;
      next = page?.next;
    }
  }

  private async request(method: string, path: string, body?: unknown, retried = false): Promise<unknown> {
    const token = retried ? await this.auth.forceRefresh() : await this.auth.accessToken();
    const res = await this.fetchFn(path.startsWith('http') ? path : `${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && !retried) return this.request(method, path, body, true);
    if (res.status === 204) return null;
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new HttpError(res.status, detail?.error?.message ?? `Spotify request failed (${res.status})`);
    }
    return res.json().catch(() => null);
  }
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/music/spotify && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/music/spotify/api.ts src/music/spotify/api.test.ts
git commit -m "feat(spotify): Web API client for playlists and playback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: SpotifyMusicSource, SDK loader and MusicRouter

**Files:**
- Create: `src/music/spotify/source.ts`, `src/music/spotify/sdk.ts`, `src/music/router.ts`
- Modify: `src/vite-env.d.ts`
- Test: `src/music/spotify/source.test.ts`, `src/music/router.test.ts`

**Interfaces:**
- Consumes: `SpotifyApi` (Task 2), `MusicSource`, `PlaybackError` (Plan 1), `SpotifyAuth` (Task 1).
- Produces:
  - `interface SdkPlayer { connect(): Promise<boolean>; disconnect(): void; activateElement(): Promise<void>; addListener(event: string, cb: (payload: unknown) => void): boolean }`
  - `type SpotifyApiLike = Pick<SpotifyApi, 'listPlaylists' | 'loadPlaylist' | 'play' | 'pause'>`
  - `PREMIUM_REQUIRED = 'Spotify Premium is required to host'`
  - `class SpotifyMusicSource implements MusicSource { constructor(api: SpotifyApiLike, createPlayer: () => Promise<SdkPlayer>); connect(): Promise<void>; activate(): Promise<void>; dispose(): void; …MusicSource }` — `play` waits for the device, never throws (failures go to `onError`); `ready()` rejects with the SDK's fatal error.
  - `loadSpotifySdk()`, `createSpotifyPlayer(auth: { accessToken(): Promise<string> }): Promise<SdkPlayer>` (browser only)
  - `class MusicRouter implements MusicSource { constructor(initial: MusicSource); use(source: MusicSource): void }` — forwards errors only from the active source; switching stops the previous one.

- [ ] **Step 1: Write the failing tests**

`src/music/spotify/source.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { PlaybackError } from '../types';
import { PREMIUM_REQUIRED, type SdkPlayer, type SpotifyApiLike, SpotifyMusicSource } from './source';

function fakePlayer(connectResult = true) {
  const listeners = new Map<string, (p: unknown) => void>();
  let activated = 0;
  let disconnected = 0;
  const player: SdkPlayer = {
    connect: async () => connectResult,
    disconnect: () => {
      disconnected++;
    },
    activateElement: async () => {
      activated++;
    },
    addListener: (event, cb) => {
      listeners.set(event, cb);
      return true;
    },
  };
  return {
    player,
    emit: (event: string, payload: unknown) => listeners.get(event)?.(payload),
    activated: () => activated,
    disconnected: () => disconnected,
  };
}

function fakeApi(failPlay = false) {
  const calls: string[] = [];
  const api: SpotifyApiLike = {
    listPlaylists: async () => [],
    loadPlaylist: async () => [],
    play: async (device, track) => {
      calls.push(`play ${device} ${track}`);
      if (failPlay) throw new Error('Restriction violated');
    },
    pause: async (device) => {
      calls.push(`pause ${device}`);
      throw new Error('already paused');
    },
  };
  return { api, calls };
}

describe('SpotifyMusicSource', () => {
  it('waits for the device before playing', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    await src.connect();
    const playing = src.play('t1');
    expect(calls).toEqual([]);
    p.emit('ready', { device_id: 'dev1' });
    await playing;
    expect(calls).toEqual(['play dev1 t1']);
  });

  it('reports a missing Premium subscription', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player);
    await src.connect();
    p.emit('account_error', { message: 'This functionality is restricted to premium users only' });
    await expect(src.ready()).rejects.toThrow(PREMIUM_REQUIRED);
  });

  it('fails when the player cannot connect', async () => {
    const src = new SpotifyMusicSource(fakeApi().api, async () => fakePlayer(false).player);
    await expect(src.connect()).rejects.toThrow('Could not connect the Spotify player');
  });

  it('turns play failures and SDK playback errors into onError, never throws', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi(true).api, async () => p.player);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.play('t1');
    p.emit('playback_error', { message: 'Cannot play track' });
    expect(errors).toEqual([
      { trackId: 't1', message: 'Restriction violated' },
      { trackId: 't1', message: 'Cannot play track' },
    ]);
  });

  it('pauses on stop, swallowing errors, and ignores playback errors when stopped', async () => {
    const p = fakePlayer();
    const { api, calls } = fakeApi();
    const src = new SpotifyMusicSource(api, async () => p.player);
    const errors: PlaybackError[] = [];
    src.onError((e) => errors.push(e));
    await src.stop();
    await src.connect();
    p.emit('ready', { device_id: 'dev1' });
    await src.stop();
    p.emit('playback_error', { message: 'late' });
    expect(calls).toEqual(['pause dev1']);
    expect(errors).toEqual([]);
  });

  it('activates and disconnects the player', async () => {
    const p = fakePlayer();
    const src = new SpotifyMusicSource(fakeApi().api, async () => p.player);
    await src.connect();
    await src.activate();
    src.dispose();
    expect([p.activated(), p.disconnected()]).toEqual([1, 1]);
  });
});
```

`src/music/router.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeMusicSource, type ToneOutput } from './fake';
import { MusicRouter } from './router';
import type { PlaybackError } from './types';

const silent: ToneOutput = { start: () => undefined, stop: () => undefined };

describe('MusicRouter', () => {
  it('plays through the active source and stops the old one on switch', async () => {
    const a = new FakeMusicSource(silent);
    const b = new FakeMusicSource(silent);
    const stops: string[] = [];
    a.stop = async () => {
      stops.push('a');
    };
    const router = new MusicRouter(a);
    await router.play('demo-01');
    router.use(b);
    await router.play('demo-02');
    expect([a.played, b.played, stops]).toEqual([['demo-01'], ['demo-02'], ['a']]);
    expect(await router.listPlaylists()).toEqual(await b.listPlaylists());
  });

  it('forwards errors only from the active source', async () => {
    const a = new FakeMusicSource(silent);
    const b = new FakeMusicSource(silent);
    const router = new MusicRouter(a);
    const errors: PlaybackError[] = [];
    router.onError((e) => errors.push(e));
    router.use(b);
    router.use(a);
    router.use(b);
    a.failNext = true;
    await a.play('demo-01');
    b.failNext = true;
    await b.play('demo-02');
    expect(errors).toEqual([{ trackId: 'demo-02', message: 'simulated failure' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/music`
Expected: FAIL — `./source`, `./router` not found.

- [ ] **Step 3: Implement**

`src/music/spotify/source.ts`:
```ts
import type { MusicSource, PlaybackError, PlaylistSummary, Track } from '../types';
import type { SpotifyApi } from './api';

export interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (payload: unknown) => void): boolean;
}

export type SpotifyApiLike = Pick<SpotifyApi, 'listPlaylists' | 'loadPlaylist' | 'play' | 'pause'>;

export const PREMIUM_REQUIRED = 'Spotify Premium is required to host';

const messageOf = (p: unknown, fallback: string) =>
  typeof p === 'object' && p !== null && typeof (p as { message?: unknown }).message === 'string'
    ? (p as { message: string }).message
    : fallback;

/** Plays through the Web Playback SDK device that lives in the host's tab. */
export class SpotifyMusicSource implements MusicSource {
  private player: SdkPlayer | null = null;
  private deviceId: string | null = null;
  private fatal: Error | null = null;
  private current: string | null = null;
  private disposed = false;
  private waiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(
    private readonly api: SpotifyApiLike,
    private readonly createPlayer: () => Promise<SdkPlayer>,
  ) {}

  async connect(): Promise<void> {
    const player = await this.createPlayer();
    if (this.disposed) {
      player.disconnect();
      return;
    }
    this.player = player;
    player.addListener('ready', (p) => {
      this.deviceId = (p as { device_id?: string }).device_id ?? null;
      if (this.deviceId) this.settle();
    });
    player.addListener('not_ready', () => {
      this.deviceId = null;
    });
    player.addListener('account_error', () => this.fail(new Error(PREMIUM_REQUIRED)));
    player.addListener('authentication_error', (p) => this.fail(new Error(messageOf(p, 'Spotify login expired'))));
    player.addListener('initialization_error', (p) => this.fail(new Error(messageOf(p, 'Spotify player failed to start'))));
    player.addListener('playback_error', (p) => {
      if (this.current) this.emit(this.current, messageOf(p, 'Playback failed'));
    });
    if (!(await player.connect())) throw new Error('Could not connect the Spotify player');
  }

  /** Must run inside a user gesture so the browser lets the SDK play audio. */
  async activate(): Promise<void> {
    await this.player?.activateElement();
  }

  dispose(): void {
    this.disposed = true;
    this.player?.disconnect();
  }

  ready(): Promise<void> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.deviceId) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.api.listPlaylists();
  }

  loadPlaylist(id: string): Promise<Track[]> {
    return this.api.loadPlaylist(id);
  }

  async play(trackId: string): Promise<void> {
    this.current = trackId;
    try {
      await this.ready();
      if (this.current !== trackId || !this.deviceId) return;
      await this.api.play(this.deviceId, trackId);
    } catch (e) {
      if (this.current === trackId) this.emit(trackId, e instanceof Error ? e.message : String(e));
    }
  }

  async stop(): Promise<void> {
    this.current = null;
    if (!this.deviceId) return;
    await this.api.pause(this.deviceId).catch(() => undefined);
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }

  private emit(trackId: string, message: string): void {
    for (const cb of this.errorCbs) cb({ trackId, message });
  }

  private settle(): void {
    for (const w of this.waiters.splice(0)) w.resolve();
  }

  private fail(e: Error): void {
    this.fatal = e;
    for (const w of this.waiters.splice(0)) w.reject(e);
  }
}
```

`src/music/spotify/sdk.ts`:
```ts
import type { SdkPlayer } from './source';

interface SpotifyNamespace {
  Player: new (options: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SdkPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifyNamespace;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let loading: Promise<SpotifyNamespace> | null = null;

export function loadSpotifySdk(): Promise<SpotifyNamespace> {
  loading ??= new Promise((resolve, reject) => {
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (window.Spotify) resolve(window.Spotify);
      else reject(new Error('Spotify player failed to load'));
    };
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => reject(new Error('Spotify player failed to load'));
    document.body.appendChild(script);
  });
  return loading;
}

export async function createSpotifyPlayer(auth: { accessToken(): Promise<string> }): Promise<SdkPlayer> {
  const Spotify = await loadSpotifySdk();
  return new Spotify.Player({
    name: 'TUBESTER',
    getOAuthToken: (cb) => {
      auth.accessToken().then(cb, () => undefined);
    },
    volume: 0.8,
  });
}
```

`src/music/router.ts`:
```ts
import type { MusicSource, PlaybackError, PlaylistSummary, Track } from './types';

/** Lets the host switch between demo tones and Spotify without rebuilding the session. */
export class MusicRouter implements MusicSource {
  private current: MusicSource;
  private readonly wired = new Set<MusicSource>();
  private readonly errorCbs: ((e: PlaybackError) => void)[] = [];

  constructor(initial: MusicSource) {
    this.current = initial;
    this.wire(initial);
  }

  use(source: MusicSource): void {
    if (source === this.current) return;
    this.current.stop().catch(() => undefined);
    this.current = source;
    this.wire(source);
  }

  listPlaylists(): Promise<PlaylistSummary[]> {
    return this.current.listPlaylists();
  }

  loadPlaylist(id: string): Promise<Track[]> {
    return this.current.loadPlaylist(id);
  }

  ready(): Promise<void> {
    return this.current.ready();
  }

  play(trackId: string): Promise<void> {
    return this.current.play(trackId);
  }

  stop(): Promise<void> {
    return this.current.stop();
  }

  onError(cb: (e: PlaybackError) => void): void {
    this.errorCbs.push(cb);
  }

  private wire(source: MusicSource): void {
    if (this.wired.has(source)) return;
    this.wired.add(source);
    source.onError((e) => {
      if (source === this.current) for (const cb of this.errorCbs) cb(e);
    });
  }
}
```

In `src/vite-env.d.ts`, add inside `ImportMetaEnv`:
```ts
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/music && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/music src/vite-env.d.ts
git commit -m "feat(spotify): SDK-backed music source and music router

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Year lookup wiring and the review model

**Files:**
- Create: `src/years/lookup.ts`, `src/host/review.ts`
- Test: `src/years/lookup.test.ts`, `src/host/review.test.ts`

**Interfaces:**
- Consumes: `lookupEarliestYear`, `FetchLike`, `createRateLimiter`, `ResolvedTrack` (Plan 1); `GameTrack` (Plan 2).
- Produces:
  - `createYearLookup(fetchFn: FetchLike, schedule?: <T>(fn: () => Promise<T>) => Promise<T>): (isrc: string) => Promise<number | null>` — default schedule is a 1.1 s rate limiter.
  - `interface ReviewRow extends ResolvedTrack { include: boolean; chosenYear: number }`
  - `toReviewRows(resolved): ReviewRow[]`, `setYear(rows, id, year, maxYear?): ReviewRow[]` (accepts integers 1900..maxYear, else unchanged), `setInclude(rows, id, include): ReviewRow[]`, `reviewSummary(rows): { total; toCheck; included }`, `gameTracks(rows): GameTrack[]`

- [ ] **Step 1: Write the failing tests**

`src/years/lookup.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createYearLookup } from './lookup';

describe('createYearLookup', () => {
  it('queries MusicBrainz through the scheduler', async () => {
    const urls: string[] = [];
    let scheduled = 0;
    const lookup = createYearLookup(
      async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ recordings: [{ 'first-release-date': '1975-10-31' }] }) };
      },
      (fn) => {
        scheduled++;
        return fn();
      },
    );
    expect(await lookup('GBUM71029604')).toBe(1975);
    expect(scheduled).toBe(1);
    expect(urls[0]).toContain('isrc:GBUM71029604');
  });
});
```

`src/host/review.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { ResolvedTrack } from '../years/resolve';
import { gameTracks, reviewSummary, setInclude, setYear, toReviewRows } from './review';

const resolved: ResolvedTrack[] = [
  { id: 'a', title: 'A', artists: ['x'], isrc: 'I1', sourceYear: 2011, mbYear: 1975, year: 1975, flag: 'mismatch' },
  { id: 'b', title: 'B', artists: ['y'], isrc: 'I2', sourceYear: 1991, mbYear: 1991, year: 1991, flag: 'ok' },
  { id: 'c', title: 'C', artists: ['z'], sourceYear: 2019, mbYear: null, year: 2019, flag: 'nomatch' },
];

describe('review model', () => {
  it('starts with every track included at its resolved year', () => {
    const rows = toReviewRows(resolved);
    expect(rows.map((r) => [r.id, r.include, r.chosenYear])).toEqual([
      ['a', true, 1975],
      ['b', true, 1991],
      ['c', true, 2019],
    ]);
    expect(reviewSummary(rows)).toEqual({ total: 3, toCheck: 2, included: 3 });
  });

  it('edits a year only to a plausible integer', () => {
    const rows = toReviewRows(resolved);
    expect(setYear(rows, 'c', 1984, 2026).find((r) => r.id === 'c')?.chosenYear).toBe(1984);
    for (const bad of [1899, 2027, 1984.5, Number.NaN]) expect(setYear(rows, 'c', bad, 2026)).toBe(rows);
  });

  it('excludes tracks and builds game tracks with the chosen years', () => {
    let rows = toReviewRows(resolved);
    rows = setInclude(rows, 'c', false);
    rows = setYear(rows, 'a', 1976, 2026);
    expect(reviewSummary(rows).included).toBe(2);
    expect(gameTracks(rows)).toEqual([
      { id: 'a', title: 'A', artists: ['x'], isrc: 'I1', sourceYear: 2011, year: 1976 },
      { id: 'b', title: 'B', artists: ['y'], isrc: 'I2', sourceYear: 1991, year: 1991 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/years/lookup.test.ts src/host/review.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/years/lookup.ts`:
```ts
import { type FetchLike, lookupEarliestYear } from './musicbrainz';
import { createRateLimiter } from './rateLimit';

type Schedule = <T>(fn: () => Promise<T>) => Promise<T>;

/** One MusicBrainz request per ~1.1 s, as their API asks. */
export function createYearLookup(
  fetchFn: FetchLike,
  schedule: Schedule = createRateLimiter(1100),
): (isrc: string) => Promise<number | null> {
  return (isrc) => schedule(() => lookupEarliestYear(isrc, fetchFn));
}
```

`src/host/review.ts`:
```ts
import type { ResolvedTrack } from '../years/resolve';
import type { GameTrack } from './session';

export interface ReviewRow extends ResolvedTrack {
  include: boolean;
  chosenYear: number;
}

export function toReviewRows(resolved: ResolvedTrack[]): ReviewRow[] {
  return resolved.map((t) => ({ ...t, include: true, chosenYear: t.year }));
}

export function setYear(
  rows: ReviewRow[],
  id: string,
  year: number,
  maxYear: number = new Date().getFullYear(),
): ReviewRow[] {
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) return rows;
  return rows.map((r) => (r.id === id ? { ...r, chosenYear: year } : r));
}

export function setInclude(rows: ReviewRow[], id: string, include: boolean): ReviewRow[] {
  return rows.map((r) => (r.id === id ? { ...r, include } : r));
}

export function reviewSummary(rows: ReviewRow[]): { total: number; toCheck: number; included: number } {
  return {
    total: rows.length,
    toCheck: rows.filter((r) => r.flag !== 'ok').length,
    included: rows.filter((r) => r.include).length,
  };
}

export function gameTracks(rows: ReviewRow[]): GameTrack[] {
  return rows
    .filter((r) => r.include)
    .map((r) => ({ id: r.id, title: r.title, artists: [...r.artists], isrc: r.isrc, sourceYear: r.sourceYear, year: r.chosenYear }));
}
```

Note: `gameTracks` copies `isrc` even when undefined; the test's expected objects for `a` and `b` have an ISRC. If a track has no ISRC, the object carries `isrc: undefined`, which `toEqual` treats as absent.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/years src/host && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/years/lookup.ts src/years/lookup.test.ts src/host/review.ts src/host/review.test.ts
git commit -m "feat(years): MusicBrainz lookup wiring and year review model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tab-audio capture

**Files:**
- Create: `src/host/broadcast.ts`
- Test: `src/host/broadcast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `NO_TAB_AUDIO = "No audio was shared. Pick “This tab” and keep “Also share tab audio” on."`, `class NoTabAudioError extends Error`
  - `pickAudioTrack(stream: StreamLike): MediaStreamTrack` where `StreamLike = { getAudioTracks(): MediaStreamTrack[]; getVideoTracks(): MediaStreamTrack[]; getTracks(): MediaStreamTrack[] }` — disables (does not stop) video; with no audio, stops everything and throws `NoTabAudioError`.
  - `interface TabAudio { track: MediaStreamTrack; stop(): void; onEnded(cb: () => void): void }`, `captureTabAudio(mediaDevices?: MediaDevices): Promise<TabAudio>` (browser only)

- [ ] **Step 1: Write the failing test** — `src/host/broadcast.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { NO_TAB_AUDIO, NoTabAudioError, pickAudioTrack } from './broadcast';

function fakeTrack(kind: 'audio' | 'video') {
  return { kind, enabled: true, stopped: false, stop() { this.stopped = true; } } as unknown as MediaStreamTrack & {
    stopped: boolean;
  };
}

function stream(...tracks: (MediaStreamTrack & { stopped: boolean })[]) {
  return {
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getTracks: () => tracks,
  };
}

describe('pickAudioTrack', () => {
  it('returns the tab audio and mutes (but keeps) the video', () => {
    const audio = fakeTrack('audio');
    const video = fakeTrack('video');
    expect(pickAudioTrack(stream(audio, video))).toBe(audio);
    expect(video.enabled).toBe(false);
    expect(video.stopped).toBe(false);
  });

  it('explains how to share audio when none was shared', () => {
    const video = fakeTrack('video');
    expect(() => pickAudioTrack(stream(video))).toThrow(NoTabAudioError);
    expect(() => pickAudioTrack(stream(fakeTrack('video')))).toThrow(NO_TAB_AUDIO);
    expect(video.stopped).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/host/broadcast.test.ts`
Expected: FAIL — cannot resolve `./broadcast`.

- [ ] **Step 3: Write `src/host/broadcast.ts`**

```ts
export const NO_TAB_AUDIO = 'No audio was shared. Pick “This tab” and keep “Also share tab audio” on.';

export class NoTabAudioError extends Error {
  constructor() {
    super(NO_TAB_AUDIO);
  }
}

interface StreamLike {
  getAudioTracks(): MediaStreamTrack[];
  getVideoTracks(): MediaStreamTrack[];
  getTracks(): MediaStreamTrack[];
}

/** Keeps the video track alive (stopping it can end the capture in Chrome) but disabled. */
export function pickAudioTrack(stream: StreamLike): MediaStreamTrack {
  const [audio] = stream.getAudioTracks();
  if (!audio) {
    for (const t of stream.getTracks()) t.stop();
    throw new NoTabAudioError();
  }
  for (const v of stream.getVideoTracks()) v.enabled = false;
  return audio;
}

export interface TabAudio {
  track: MediaStreamTrack;
  stop(): void;
  onEnded(cb: () => void): void;
}

/** Asks the host to share this tab with its audio (Spotify plays here). */
export async function captureTabAudio(mediaDevices: MediaDevices = navigator.mediaDevices): Promise<TabAudio> {
  const options = {
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
    },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'exclude',
  } as DisplayMediaStreamOptions;
  const stream = await mediaDevices.getDisplayMedia(options);
  const track = pickAudioTrack(stream);
  return {
    track,
    stop: () => {
      for (const t of stream.getTracks()) t.stop();
    },
    onEnded: (cb) => {
      for (const t of stream.getTracks()) t.addEventListener('ended', cb, { once: true });
    },
  };
}
```

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/host/broadcast.test.ts && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/host/broadcast.ts src/host/broadcast.test.ts
git commit -m "feat(host): capture the game tab's audio for broadcast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Spotify host UI — login return, music panel, year review, broadcast

**Files:**
- Modify: `src/ui/router.ts`, `src/ui/router.test.ts`, `src/App.tsx`, `src/ui/HostLobby.tsx`, `src/ui/HostApp.tsx`, `src/ui/theme.css`, `.gitignore`, `e2e/game.spec.ts`
- Create: `src/ui/useSpotify.ts`, `src/ui/MusicPanel.tsx`, `src/ui/YearReview.tsx`

**Interfaces:**
- Consumes: Tasks 1–5; `HostSession`, `GameTrack`, `DEMO_TRACKS`, `FakeMusicSource`, `createToneFeed`, `idbYearCache`, `resolveYears`.
- Produces:
  - `parseRoute(hash: string, search?: string): Route` — a `?state=` query (Spotify's redirect) routes to `host`; `App` passes `window.location.search`.
  - `useSpotify(): SpotifyState` with `{ available, loggedIn, playlists, progress, rows, source, playerReady, error, login, logout, importPlaylist, setRows }`; reviewed rows persisted under `REVIEW_KEY = 'tubester.review'`.
  - `type MusicMode = 'demo' | 'spotify'`, `type BroadcastState = 'off' | 'starting' | 'on' | 'lost'`, `MusicPanel`, `YearReview`.
  - `HostLobby` props become `{ code, snap, session, onClose, music: ReactNode, musicReady: boolean, tracks: GameTrack[] }`.
- Test hooks: the e2e still drives the demo path; the Music source radio group is labelled `Music source` with a `Demo tones` radio.

The React glue is exercised by the Playwright suite on the demo path (Spotify needs a real Premium login and is covered by `docs/manual-test.md` in Task 7). The route change gets a unit test.

- [ ] **Step 1: Write the failing route test** — append to the `it.each` table in `src/ui/router.test.ts` a second describe:

```ts
describe('parseRoute after the Spotify redirect', () => {
  it('sends the login callback to the host screen', () => {
    expect(parseRoute('', '?code=abc&state=xyz')).toEqual({ name: 'host' });
    expect(parseRoute('', '?error=access_denied&state=xyz')).toEqual({ name: 'host' });
    expect(parseRoute('', '?utm=1')).toEqual({ name: 'home' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/router.test.ts`
Expected: FAIL — `parseRoute('', '?code…')` returns home.

- [ ] **Step 3: Update the router** — in `src/ui/router.ts`, replace `parseRoute` and `useRoute`:

```ts
export function parseRoute(hash: string, search = ''): Route {
  const join = /^#\/join\/(TUBE-[A-Z0-9]{4})$/i.exec(hash);
  if (join) return { name: 'join', code: join[1].toUpperCase() };
  if (hash === '#/host' || new URLSearchParams(search).has('state')) return { name: 'host' };
  return { name: 'home' };
}

export function useRoute(): Route {
  const read = () => parseRoute(window.location.hash, window.location.search);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash, window.location.search));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

Run: `npx vitest run src/ui/router.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `src/ui/useSpotify.ts`**

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ReviewRow, toReviewRows } from '../host/review';
import { SpotifyApi } from '../music/spotify/api';
import { SpotifyAuth } from '../music/spotify/auth';
import { createSpotifyPlayer } from '../music/spotify/sdk';
import { SpotifyMusicSource } from '../music/spotify/source';
import type { PlaylistSummary } from '../music/types';
import { browserFetch } from '../util/http';
import { idbYearCache } from '../years/cache';
import { createYearLookup } from '../years/lookup';
import { resolveYears } from '../years/resolve';

export const REVIEW_KEY = 'tubester.review';

function loadRows(): ReviewRow[] {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? (JSON.parse(raw) as ReviewRow[]) : [];
  } catch {
    return [];
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface SpotifyState {
  available: boolean;
  loggedIn: boolean;
  playlists: PlaylistSummary[] | null;
  progress: { done: number; total: number } | null;
  rows: ReviewRow[];
  source: SpotifyMusicSource | null;
  playerReady: boolean;
  error: string | null;
  login(): void;
  logout(): void;
  importPlaylist(id: string): void;
  setRows(rows: ReviewRow[]): void;
}

export function useSpotify(): SpotifyState {
  const deps = useMemo(() => {
    const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
    if (!clientId) return null;
    const auth = new SpotifyAuth({
      clientId,
      redirectUri: `${window.location.origin}${window.location.pathname}`,
      storage: localStorage,
      fetchFn: browserFetch,
    });
    return { auth, api: new SpotifyApi(auth, browserFetch) };
  }, []);
  const [loggedIn, setLoggedIn] = useState(() => deps?.auth.isLoggedIn() ?? false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRowsState] = useState<ReviewRow[]>(loadRows);
  const [playerReady, setPlayerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(
    () => (deps && loggedIn ? new SpotifyMusicSource(deps.api, () => createSpotifyPlayer(deps.auth)) : null),
    [deps, loggedIn],
  );

  useEffect(() => {
    if (!deps || !window.location.search) return;
    deps.auth
      .completeLogin(window.location.search)
      .then(
        (handled) => {
          if (handled) setLoggedIn(true);
        },
        (e) => setError(messageOf(e)),
      )
      .finally(() => window.history.replaceState(null, '', `${window.location.pathname}#/host`));
  }, [deps]);

  useEffect(() => {
    if (!deps || !loggedIn) return;
    deps.api.listPlaylists().then(setPlaylists, (e) => setError(messageOf(e)));
  }, [deps, loggedIn]);

  useEffect(() => {
    if (!source) return;
    setPlayerReady(false);
    source.connect().catch((e) => setError(messageOf(e)));
    source.ready().then(
      () => setPlayerReady(true),
      (e) => setError(messageOf(e)),
    );
    return () => source.dispose();
  }, [source]);

  const setRows = useCallback((next: ReviewRow[]) => {
    setRowsState(next);
    try {
      localStorage.setItem(REVIEW_KEY, JSON.stringify(next));
    } catch {
      // storage full: keep the review in memory only
    }
  }, []);

  const importPlaylist = useCallback(
    (id: string) => {
      if (!deps) return;
      setError(null);
      setProgress({ done: 0, total: 0 });
      deps.api
        .loadPlaylist(id)
        .then((tracks) =>
          resolveYears(tracks, {
            lookup: createYearLookup(browserFetch),
            cache: idbYearCache(),
            onProgress: (done, total) => setProgress({ done, total }),
          }),
        )
        .then((resolved) => setRows(toReviewRows(resolved)))
        .catch((e) => setError(messageOf(e)))
        .finally(() => setProgress(null));
    },
    [deps, setRows],
  );

  const login = useCallback(() => {
    deps?.auth.beginLogin().then(
      (url) => window.location.assign(url),
      (e) => setError(messageOf(e)),
    );
  }, [deps]);

  const logout = useCallback(() => {
    deps?.auth.logout();
    setLoggedIn(false);
    setPlaylists(null);
  }, [deps]);

  return {
    available: deps !== null,
    loggedIn,
    playlists,
    progress,
    rows,
    source,
    playerReady,
    error,
    login,
    logout,
    importPlaylist,
    setRows,
  };
}
```

- [ ] **Step 5: Write `src/ui/MusicPanel.tsx`**

```tsx
import { useState } from 'react';
import { reviewSummary } from '../host/review';
import { DEMO_TRACKS } from '../music/demo';
import type { SpotifyState } from './useSpotify';

export type MusicMode = 'demo' | 'spotify';
export type BroadcastState = 'off' | 'starting' | 'on' | 'lost';

export function MusicPanel({
  mode,
  setMode,
  spotify,
  broadcast,
  broadcastError,
  onStartBroadcast,
  onReview,
}: {
  mode: MusicMode;
  setMode: (m: MusicMode) => void;
  spotify: SpotifyState;
  broadcast: BroadcastState;
  broadcastError: string | null;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  return (
    <section className="panel">
      <h2>Music</h2>
      <fieldset className="choices">
        <legend className="muted">Music source</legend>
        <label className="choice">
          <input type="radio" name="music" checked={mode === 'demo'} onChange={() => setMode('demo')} />
          Demo tones
        </label>
        {spotify.available && (
          <label className="choice">
            <input type="radio" name="music" checked={mode === 'spotify'} onChange={() => setMode('spotify')} />
            Spotify
          </label>
        )}
      </fieldset>
      {mode === 'demo' && <p className="muted">Demo hits · {DEMO_TRACKS.length} songs, played as test tones.</p>}
      {mode === 'spotify' && (
        <SpotifySteps spotify={spotify} broadcast={broadcast} onStartBroadcast={onStartBroadcast} onReview={onReview} />
      )}
      {spotify.error && (
        <p className="error" role="alert">
          {spotify.error}
        </p>
      )}
      {broadcastError && (
        <p className="error" role="alert">
          {broadcastError}
        </p>
      )}
    </section>
  );
}

function SpotifySteps({
  spotify,
  broadcast,
  onStartBroadcast,
  onReview,
}: {
  spotify: SpotifyState;
  broadcast: BroadcastState;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  const [picked, setPicked] = useState('');
  if (!spotify.loggedIn) {
    return (
      <>
        <p className="muted">Spotify Premium is needed on this computer only. Guests just need the link.</p>
        <button type="button" className="btn primary" onClick={spotify.login}>
          Log in with Spotify
        </button>
      </>
    );
  }
  const summary = reviewSummary(spotify.rows);
  const importing = spotify.progress !== null;
  return (
    <div className="rows">
      <label className="field">
        Playlist
        <select className="input" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">{spotify.playlists ? 'Pick one of your playlists' : 'Loading playlists…'}</option>
          {spotify.playlists?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.trackCount})
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Only playlists you own or collaborate on can be read. To use someone else's playlist, save a copy to your
        library first.
      </p>
      <button
        type="button"
        className="btn small"
        disabled={!picked || importing}
        onClick={() => spotify.importPlaylist(picked)}
      >
        {spotify.progress ? `Checking years… ${spotify.progress.done}/${spotify.progress.total}` : 'Import playlist'}
      </button>
      {summary.total > 0 && (
        <div className="row">
          <span className="muted">
            {summary.included} songs · {summary.toCheck} to check
          </span>
          <button type="button" className="btn small" onClick={onReview}>
            Review years
          </button>
        </div>
      )}
      {broadcast === 'on' ? (
        <span className="chip live">Broadcasting this tab</span>
      ) : (
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!spotify.playerReady || broadcast === 'starting'}
            onClick={onStartBroadcast}
          >
            {broadcast === 'lost' ? 'Resume broadcast' : 'Start broadcast'}
          </button>
          <p className="muted">
            Chrome will ask what to share: pick <b>this tab</b> and keep “Also share tab audio” on.
          </p>
          {!spotify.playerReady && <p className="muted">Connecting the Spotify player…</p>}
        </>
      )}
      <button type="button" className="btn small" onClick={spotify.logout}>
        Log out of Spotify
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/ui/YearReview.tsx`**

```tsx
import { useState } from 'react';
import { type ReviewRow, reviewSummary, setInclude, setYear } from '../host/review';

export function YearReview({
  rows,
  onChange,
  onDone,
}: {
  rows: ReviewRow[];
  onChange: (rows: ReviewRow[]) => void;
  onDone: () => void;
}) {
  const [all, setAll] = useState(false);
  const summary = reviewSummary(rows);
  const shown = all ? rows : rows.filter((r) => r.flag !== 'ok');
  return (
    <section className="panel">
      <div className="row">
        <div className="rows">
          <h2>Year review</h2>
          <span className="muted">
            {summary.total} tracks · {summary.total - summary.toCheck} confirmed by MusicBrainz · {summary.toCheck} to
            check
          </span>
        </div>
        <div className="actions">
          <button type="button" className={all ? 'btn small' : 'btn small selected'} aria-pressed={!all} onClick={() => setAll(false)}>
            To check ({summary.toCheck})
          </button>
          <button type="button" className={all ? 'btn small selected' : 'btn small'} aria-pressed={all} onClick={() => setAll(true)}>
            All ({summary.total})
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="review">
          <thead>
            <tr>
              <th>Track</th>
              <th>Spotify date</th>
              <th>Earliest found</th>
              <th>Use year</th>
              <th>Include</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.title}</b> · {r.artists.join(', ')}
                </td>
                <td>{r.sourceYear}</td>
                <td className={r.flag === 'ok' ? undefined : 'warn'}>{r.mbYear ?? 'No match'}</td>
                <td>
                  <input
                    key={r.chosenYear}
                    className="input narrow"
                    type="number"
                    inputMode="numeric"
                    defaultValue={r.chosenYear}
                    aria-label={`Year for ${r.title}`}
                    onBlur={(e) => {
                      onChange(setYear(rows, r.id, Number(e.target.value)));
                      e.target.value = String(r.chosenYear);
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.include}
                    aria-label={`Include ${r.title}`}
                    onChange={(e) => onChange(setInclude(rows, r.id, e.target.checked))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted">Nothing left to check.</p>}
      <button type="button" className="btn primary" onClick={onDone}>
        Done · {summary.included} songs
      </button>
    </section>
  );
}
```

- [ ] **Step 7: Append styles to `src/ui/theme.css`**

```css
.btn.selected { border-color: var(--me); color: var(--me); }
.choices { display: flex; flex-wrap: wrap; gap: 8px; border: none; padding: 0; margin: 0; }
.choices legend { padding: 0; margin-bottom: 6px; }
.choice { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-strong); font-size: 14px; cursor: pointer; }
.choice:has(input:checked) { border-color: var(--me); color: var(--me); }
.table-wrap { overflow-x: auto; }
table.review { width: 100%; border-collapse: collapse; font-size: 13px; }
table.review th { text-align: left; color: var(--muted); font-weight: 500; padding: 8px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.review td { padding: 8px 10px; border-bottom: 1px solid #22262f; }
table.review td.warn { color: var(--steal-text); font-weight: 600; }
```

- [ ] **Step 8: Rework `src/ui/HostLobby.tsx`** — replace the whole file:

```tsx
import { type ReactNode, useState } from 'react';
import { canStart, MAX_PLAYERS, TEAMS } from '../host/lobby';
import type { GameTrack, HostSession, HostSnapshot } from '../host/session';
import { Wordmark } from './components';
import { joinUrl } from './router';

export function HostLobby({
  code,
  snap,
  session,
  onClose,
  music,
  musicReady,
  tracks,
}: {
  code: string;
  snap: HostSnapshot;
  session: HostSession;
  onClose: () => void;
  music: ReactNode;
  musicReady: boolean;
  tracks: GameTrack[];
}) {
  const [error, setError] = useState<string | null>(null);
  const { lobby } = snap;
  const link = joinUrl(code);
  const teamsReady = canStart(lobby);

  function start() {
    const r = session.startGame(tracks);
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
          {music}
          <section className="panel">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn primary" disabled={!teamsReady || !musicReady} onClick={start}>
              Start game
            </button>
            {!teamsReady && <p className="muted">Need at least 2 teams.</p>}
            {teamsReady && !musicReady && <p className="muted">Finish the music setup first.</p>}
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
        onBlur={(e) => {
          onCommit(e.target.value === '' ? Number.NaN : Number(e.target.value));
          // If the value was rejected or clamped back to the same number, `key` won't remount: show it again.
          e.target.value = String(value);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 9: Rework `src/ui/HostApp.tsx`** — replace the whole file:

```tsx
import { useEffect, useRef, useState } from 'react';
import { captureTabAudio, type TabAudio } from '../host/broadcast';
import { gameTracks } from '../host/review';
import { HostSession, type HostSnapshot } from '../host/session';
import { DEMO_TRACKS } from '../music/demo';
import { FakeMusicSource } from '../music/fake';
import { MusicRouter } from '../music/router';
import { createToneFeed, type ToneFeed } from '../music/tone';
import { createHostTransport } from '../net/peer';
import { newRoomCode } from '../net/room';
import type { HostTransport } from '../net/transport';
import { browserTimer } from '../util/timer';
import { Wordmark } from './components';
import { HostBoard } from './HostBoard';
import { HostLobby } from './HostLobby';
import { HOST_ID_KEY, NAME_KEY, ROOM_KEY } from './keys';
import { type BroadcastState, type MusicMode, MusicPanel } from './MusicPanel';
import { useSpotify } from './useSpotify';
import { YearReview } from './YearReview';

const MODE_KEY = 'tubester.music';

function hostId(): string {
  let id = localStorage.getItem(HOST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(HOST_ID_KEY, id);
  }
  return id;
}

export function HostApp() {
  const spotify = useSpotify();
  const [code] = useState(() => {
    const c = localStorage.getItem(ROOM_KEY) ?? newRoomCode();
    localStorage.setItem(ROOM_KEY, c);
    return c;
  });
  const [mode, setModeState] = useState<MusicMode>(() =>
    spotify.available && localStorage.getItem(MODE_KEY) === 'spotify' ? 'spotify' : 'demo',
  );
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [status, setStatus] = useState<'opening' | 'ready' | 'error'>('opening');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastState>('off');
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const sessionRef = useRef<HostSession | null>(null);
  const feedRef = useRef<ToneFeed | null>(null);
  const demoRef = useRef<FakeMusicSource | null>(null);
  const routerRef = useRef<MusicRouter | null>(null);
  const transportRef = useRef<HostTransport | null>(null);
  const captureRef = useRef<TabAudio | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => undefined;
    const feed = createToneFeed();
    const demo = new FakeMusicSource(feed.output);
    const router = new MusicRouter(demo);
    feedRef.current = feed;
    demoRef.current = demo;
    routerRef.current = router;
    setSoundBlocked(feed.context.state === 'suspended');
    createHostTransport(code).then(
      (transport) => {
        if (cancelled) {
          transport.close();
          return;
        }
        transportRef.current = transport;
        const session = new HostSession({
          transport,
          music: router,
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
      captureRef.current?.stop();
      feed.close();
    };
  }, [code]);

  // Route music and the broadcast track to the chosen source.
  useEffect(() => {
    const router = routerRef.current;
    const transport = transportRef.current;
    const feed = feedRef.current;
    const demo = demoRef.current;
    if (status !== 'ready' || !router || !transport || !feed || !demo) return;
    if (mode === 'demo') {
      router.use(demo);
      transport.setAudioTrack(feed.track);
      return;
    }
    if (spotify.source) router.use(spotify.source);
    transport.setAudioTrack(captureRef.current?.track ?? null);
  }, [status, mode, spotify.source]);

  function setMode(next: MusicMode) {
    localStorage.setItem(MODE_KEY, next);
    setModeState(next);
  }

  async function startBroadcast() {
    setBroadcast('starting');
    setBroadcastError(null);
    try {
      await spotify.source?.activate();
      captureRef.current?.stop();
      const capture = await captureTabAudio();
      captureRef.current = capture;
      capture.onEnded(() => {
        if (captureRef.current !== capture) return;
        captureRef.current = null;
        transportRef.current?.setAudioTrack(null);
        setBroadcast('lost');
      });
      transportRef.current?.setAudioTrack(capture.track);
      setBroadcast('on');
    } catch (e) {
      setBroadcast(captureRef.current ? 'on' : 'off');
      setBroadcastError(e instanceof Error ? e.message : String(e));
    }
  }

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
  const tracks = mode === 'demo' ? DEMO_TRACKS : gameTracks(spotify.rows);
  const musicReady = mode === 'demo' || (broadcast === 'on' && spotify.playerReady && tracks.length > 0);
  const needsBroadcast = mode === 'spotify' && broadcast !== 'on' && !!snap?.view;

  return (
    <main className="screen wide">
      {soundBlocked && mode === 'demo' && (
        <button type="button" className="banner" onClick={enableSound}>
          Enable sound
        </button>
      )}
      {needsBroadcast && (
        <button type="button" className="banner" onClick={() => void startBroadcast()}>
          Broadcast stopped · Resume broadcast
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
      {status === 'ready' && session && snap?.view && <HostBoard code={code} snap={snap} session={session} />}
      {status === 'ready' && session && snap && !snap.view && reviewing && (
        <YearReview rows={spotify.rows} onChange={spotify.setRows} onDone={() => setReviewing(false)} />
      )}
      {status === 'ready' && session && snap && !snap.view && !reviewing && (
        <HostLobby
          code={code}
          snap={snap}
          session={session}
          onClose={closeRoom}
          musicReady={musicReady}
          tracks={tracks}
          music={
            <MusicPanel
              mode={mode}
              setMode={setMode}
              spotify={spotify}
              broadcast={broadcast}
              broadcastError={broadcastError}
              onStartBroadcast={() => void startBroadcast()}
              onReview={() => setReviewing(true)}
            />
          }
        />
      )}
    </main>
  );
}
```

- [ ] **Step 10: Route the OAuth return in `src/App.tsx`** — no change needed beyond `useRoute` (it now reads `location.search`). Verify `App` still reads:

```tsx
export function App() {
  const route = useRoute();
  if (route.name === 'host') return <HostApp />;
  if (route.name === 'join') return <GuestApp key={route.code} code={route.code} />;
  return <Home />;
}
```

- [ ] **Step 11: Keep local secrets out of git** — append `.env.local` to `.gitignore`.

- [ ] **Step 12: Assert the demo choice in e2e** — in `e2e/game.spec.ts`, in the first test right after `await expect(host.page.getByLabel('Team for Marco')).toBeVisible();`, add:

```ts
  await expect(host.page.getByRole('radio', { name: 'Demo tones' })).toBeChecked();
```

- [ ] **Step 13: Full verification**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all pass (e2e runs without `VITE_SPOTIFY_CLIENT_ID`, so only the demo option shows).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(ui): Spotify login, playlist import, year review and tab broadcast on the host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Deploy to GitHub Pages, setup guide and manual checklist

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/spotify-setup.md`, `docs/manual-test.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: production site `https://k3rmitt.github.io/tubester/`, built on every push to `main` with `VITE_SPOTIFY_CLIENT_ID` from the repo variable `SPOTIFY_CLIENT_ID`.

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch: {}
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SPOTIFY_CLIENT_ID: ${{ vars.SPOTIFY_CLIENT_ID }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write `docs/spotify-setup.md`**

```markdown
# Spotify setup (host only)

Guests never need Spotify. Only the person hosting logs in, and that account needs **Spotify Premium**.

## 1. Create the Spotify app (once)

1. Open https://developer.spotify.com/dashboard and **Create app**.
2. Name: `TUBESTER`. Description: anything.
3. Redirect URIs (exactly, with the trailing slash):
   - `https://k3rmitt.github.io/tubester/`
   - `http://127.0.0.1:5173/tubester/`
4. APIs used: **Web API** and **Web Playback SDK**.
5. Save, then copy the **Client ID** (it is public, not a secret).

The app stays in Development Mode: the app owner needs Premium, and up to 5 Spotify accounts can host. Add each host under **User Management** (name + Spotify account email).

## 2. Run locally with Spotify

    echo "VITE_SPOTIFY_CLIENT_ID=<your client id>" > .env.local
    npm run dev -- --host 127.0.0.1

Open http://127.0.0.1:5173/tubester/ in desktop Chrome (not `localhost`: Spotify only accepts the loopback IP).

## 3. Production

    gh variable set SPOTIFY_CLIENT_ID --body "<your client id>" -R k3rmitt/tubester

Then any push to `main` deploys to https://k3rmitt.github.io/tubester/.

## Limits to know

- Only playlists you **own or collaborate on** can be imported. To use a Spotify or friend's playlist, open it in Spotify and **Add to other playlist → New playlist** (or "Save as copy").
- Importing checks each song's first release year on MusicBrainz at about one song per second, so a 100-song playlist takes ~2 minutes the first time (cached afterwards).
```

- [ ] **Step 3: Write `docs/manual-test.md`**

```markdown
# Manual test checklist (real devices)

Run before announcing a release. Host: desktop Chrome with a Premium account allowlisted in the Spotify app.

## Host setup
- [ ] Create room → lobby shows the invite link and room code.
- [ ] Music source: choose **Spotify** → **Log in with Spotify** → back on the host lobby, URL has no `?code`.
- [ ] Cancel the Spotify login once → a clear "Spotify login was cancelled" message, lobby still usable.
- [ ] Playlist list shows only your own/collaborative playlists.
- [ ] Import a ~30-song playlist → progress counts up → "N songs · M to check".
- [ ] **Review years**: "To check" shows flagged rows; edit a year, untick a song, **Done**; reload the page → review is kept.
- [ ] **Start broadcast** → Chrome dialog → "This tab" + "Also share tab audio" → chip "Broadcasting this tab".
- [ ] Share without tab audio once → clear error, Start broadcast available again.

## Guests
- [ ] iPhone Safari joins via link, hears audio after the 3 s countdown (if not, the "Tap to enable sound" banner fixes it).
- [ ] Android Chrome joins and hears audio.
- [ ] Screen stays awake during the game.

## Game
- [ ] The host never sees the playing song's title before the reveal.
- [ ] Reveal shows the reviewed year (not the remaster year).
- [ ] A track that can't play in your country is skipped automatically, nobody loses a token.
- [ ] Stop sharing from Chrome's bar → "Broadcast stopped · Resume broadcast" banner → resume works, guests hear audio again.
- [ ] Reload the host tab mid-game → game comes back, press Resume broadcast, guests reconnect.
- [ ] Play 60+ minutes → no Spotify logout (token refresh works).
```

- [ ] **Step 4: Update `README.md`** — replace its content:

```markdown
# TUBESTER

A remote music-timeline party game. The host plays songs from their Spotify (or demo test tones), friends join from their phones with a link, and everyone races to build a timeline of release years. Steal with **TUBESTER!**

- Play: https://k3rmitt.github.io/tubester/
- Host: desktop Chrome or Edge (Spotify Premium for real songs). Guests: any modern browser, no account.
- Spotify setup: [docs/spotify-setup.md](docs/spotify-setup.md)
- Design: [docs/superpowers/specs/2026-11-01-tubester-design.md](docs/superpowers/specs/2026-11-01-tubester-design.md)

## Develop

    npm ci
    npm run dev -- --host 127.0.0.1
    npm test        # unit tests
    npm run e2e     # browser games against a local PeerJS server
    npm run lint && npm run typecheck
```

- [ ] **Step 5: Verify, commit, push**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all pass.

```bash
git add -A
git commit -m "chore: GitHub Pages deploy, Spotify setup guide and manual checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/spotify
```

- [ ] **Step 6: Enable GitHub Pages and set the client id (ask the user first — these change public repo settings)**

The executor proposes these commands to the user and runs them only with their go-ahead (or the user runs them with `!`):

```bash
GH_TOKEN=$(gh auth token -u k3rmitt) gh api -X POST repos/k3rmitt/tubester/pages -f build_type=workflow
GH_TOKEN=$(gh auth token -u k3rmitt) gh variable set SPOTIFY_CLIENT_ID --body "<client id from docs/spotify-setup.md step 1>" -R k3rmitt/tubester
```

Expected: the Pages site exists (deploys after the PR merges to `main`); `gh variable list -R k3rmitt/tubester` shows `SPOTIFY_CLIENT_ID`.
