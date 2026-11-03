# TUBESTER — project guide

Remote music-timeline party game. Live at https://k3rmitt.github.io/tubester/. Start here, then read `docs/STATUS.md` (current state, decisions, backlog).

## Non-negotiables

- Brand is **TUBESTER**; the steal button reads **"TUBESTER!"**. Never write "Hitster" in code, UI, docs or identifiers.
- Never commit on `main`. Branch, push, open a PR (repo `k3rmitt/tubester`). Commits end with the Co-Authored-By line Claude Code gives you.
- TDD: write the failing test, watch it fail, then implement. Run the whole suite before claiming done.
- Guests are untrusted: every guest message goes through `parseGuestMessage` (`src/net/protocol.ts`) and every intent through `HostRuntime.handleIntent` (`src/host/runtime.ts`). The current track's title/artists/year/trackId must never leave the host before the reveal: only `HostRuntime.viewFor` output is sent.
- Guests are mobile-first (works at 360 px, no sideways scroll, 44 px tap targets). Hosting needs desktop Chrome/Edge.

## Commands

    npm ci
    npm run dev -- --host 127.0.0.1   # http://127.0.0.1:5173/tubester/ (Spotify needs 127.0.0.1, not localhost)
    npm test                          # Vitest unit tests (src/**/*.test.ts)
    npm run e2e                       # Playwright: starts a local PeerJS server (port 9000) + Vite; demo-tone path only
    npm run lint                      # Biome
    npm run typecheck                 # tsc 7 (native)
    npm run build

`.env.local` (git-ignored) holds `VITE_SPOTIFY_CLIENT_ID`. Production gets it from the repo variable `SPOTIFY_CLIENT_ID`. See `docs/spotify-setup.md`.

## Tooling gotchas

- TypeScript is **7.x (native `tsc`) with no JavaScript API**: tools that need it (typescript-eslint, ts-morph…) won't work. Lint is Biome.
- React StrictMode is intentionally off (`src/main.tsx`): double-mounted effects open two PeerJS peers fighting for the same room id, and `SpotifyMusicSource.dispose()` is final.
- macOS file names are case-insensitive: a helper `foo.ts` next to a component `Foo.tsx` breaks `tsc` ("differs only in casing"). Name helpers differently (`splashMode.ts`, `tutorialContent.ts`).
- Git pushes go out as GitHub account `k3rmitt` via a repo-local credential helper; `gh` commands need `GH_TOKEN=$(gh auth token -u k3rmitt)` (the globally active `gh` account is a work account).
- Spotify is in Development Mode (Feb 2026 rules): owner needs Premium, max 5 allowlisted hosts, only owned/collaborative playlists are readable, playlist tracks come from `GET /playlists/{id}/items` with entries under `item`.

## Architecture (where things live)

```
src/engine/    pure rules reducer: createGame, apply(state, action) → {ok,state}|{ok:false,reason}
src/match/     fuzzy title/artist matcher (naming bonus)
src/years/     MusicBrainz earliest year by ISRC, rate limiter, IndexedDB cache, resolver
src/host/      view (filtered GameView), runtime (intents, timers, save/restore), lobby, session
               (HostSession: lobby + runtime + music + transport), review (year review model), broadcast (tab capture)
src/guest/     GuestSession (identity + secret, re-hello on reconnect)
src/net/       protocol (validated messages), transport interfaces, memory hub (tests), peer (PeerJS adapters), room codes
src/music/     MusicSource interface, demo playlist + FakeMusicSource (tones), tone feed (WebAudio),
               MusicRouter (demo ↔ Spotify), spotify/ (PKCE auth, Web API, SDK source, SDK loader)
src/ui/        React screens: Home, GuestApp, HostApp, HostLobby, HostBoard, PlayPanel, MusicPanel, YearReview
e2e/           Playwright games (3 browsers, host reload)
```

Data flow: host browser is the referee (pure P2P, star topology over PeerJS). Guest → `hello`/`intent` → `HostSession` → `HostRuntime` → engine. Host → `lobby`/`state{view,…}` per connection. Audio: Spotify Web Playback SDK plays in the host tab → `getDisplayMedia` captures that tab → PeerJS media call to each guest (demo mode streams a WebAudio tone instead).

## How work is organised

- Design: `docs/superpowers/specs/2026-11-01-tubester-design.md` (the binding spec).
- Executed plans (history, with full code): `docs/superpowers/plans/` — Plan 1 core, Plan 2 playable, Plan 3 Spotify & deploy.
- New features: brainstorm → update the spec → write a new plan in `docs/superpowers/plans/` → execute on a branch → whole-branch review → PR.
- Mockups (design canvas): https://claude.ai/artifact/LmoRcUw45fgjfF7nZrs2X3 — look: ground `#0F1115`, surface `#1A1D24`, text `#F2F0EA`, muted `#9AA0AC`, yellow `#FFD23F` you, orange `#FF8A4C` steal, blue `#5AB0FF` others; Space Grotesk + Inter; no emoji.
