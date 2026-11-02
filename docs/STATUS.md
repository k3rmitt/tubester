# TUBESTER — status, decisions and backlog

Last updated: 2026-11-02 (after PR #3).

## Status

- **Live:** https://k3rmitt.github.io/tubester/ (deployed by `.github/workflows/deploy.yml` on every push to `main`).
- **Done:** Plan 1 (core rules, matcher, years, host runtime) · Plan 2 (lobby, PeerJS, screens, e2e) · Plan 3 (Spotify, year review, tab broadcast, deploy).
- **Tests:** 227 unit tests, 2 Playwright games (demo-tone path), CI on every branch push and PR.
- **Not yet verified on real devices:** real Spotify login/playback, tab-audio capture, iPhone/Android guests. Run `docs/manual-test.md` with a Premium account.

## Decisions that differ from the original rules or first spec

| Decision | Why | Revisit if |
|---|---|---|
| The active team cannot buy a card during its own turn | Buying would shift the slot it already chose | Players want it; store slots as year bounds instead of indices |
| When the host stops sharing audio, the game keeps running with a **Resume broadcast** banner (no pause) | A pause needs pause support in the engine timers | Games get derailed by accidental "Stop sharing" |
| After 3 playback failures in a row, the game stops skipping and shows **Music stopped · Try again** | Avoid silently burning the deck (revoked login, lost device) | — |
| Name guess is sent with "lock in"; bonus needs both title and artist (fuzzy) | Simpler protocol | — |
| Steal: pick a slot first, then press TUBESTER!; order = arrival at host | One step under a short timer | — |
| Game year = earliest of MusicBrainz and Spotify year; host can edit/exclude in review | Remasters/compilations carry wrong years | — |
| Each phone has a public player id + private secret; one player per connection; newest tab wins | Player ids are visible to everyone | — |
| No React StrictMode; lint is Biome; TypeScript 7 native | See `CLAUDE.md` tooling gotchas | — |
| No host Pause button (only Pass turn, Next, New game) | Scope | Players ask for it |

## Backlog

### Deferred minors from code reviews

Engine & runtime (Plan 1)
- `createGame` accepts non-finite years (NaN); use `Number.isFinite`.
- `HostRuntime` players map is a plain object: ids like `constructor` resolve to prototype values (harmless today); use `Object.hasOwn` or a `Map`.
- `createGame` doesn't validate settings, duplicate team ids or duplicate deck ids.
- `resolveYears`: `cache.get` failure rejects the whole import; a `cache.set` failure discards a good year.
- `HostRuntime.restore` trusts the saved state's shape.
- Matcher: a title that is only "(Intro)" normalizes to empty; `feat`/`ft` and `n`→`and` rewrites can alter some titles.

Network & screens (Plan 2)
- Connections that never say hello are unlimited and get the audio call immediately (only someone with the room code can do this).
- iOS: the "unlock audio" call on Join doesn't help; the "Tap to enable sound" banner covers it.
- `createHostTransport` keeps retrying up to 30 s if the host page closes while opening.
- Host PeerJS `error` events after open are ignored.
- **Close room** doesn't notify guests.
- A guest reconnecting mid steal window sees the full countdown again (host timer still decides).
- Very long unbroken song titles can overflow the reveal card (`overflow-wrap`).
- The reveal isn't announced to screen readers (`aria-live`).
- No rate limit on `hello` messages.
- Host reload before the game starts loses the lobby (players auto-rejoin).

Spotify & broadcast (Plan 3)
- `SpotifyMusicSource.dispose()` is final (only matters if StrictMode returns).
- Switching music source re-sends audio to every guest even when the track didn't change.
- Double click on **Start broadcast** opens two share prompts.
- After a host reload mid-game with a revoked login, demo tones play until the host logs in again.
- A corrupted saved review (`tubester.review`) crashes the review screen; validate on load.
- An old Spotify error message stays visible after recovery.
- No retry on Spotify 429 (rate limit).
- `MusicRouter` keeps a reference to every source it used.
- PKCE verifier is in localStorage (sessionStorage would be tighter); tokens in localStorage are an accepted trade-off.
- `docs/spotify-setup.md` doesn't mention Pages → Source = GitHub Actions (already set on the repo).
- Room-code alphabet has a tiny modulo bias (harmless).

### Ideas not started

- Game modes from the original rules: Pro (name artist + title to keep the card), Expert (exact year), Cooperative.
- More than 8 devices (needs a media relay / SFU).
- Other music sources behind `MusicSource` (YouTube, Deezer previews) so guests-only groups can play without Premium.
- Spectator view (TV screen) without a team.

### Housekeeping

- Merged branches still exist on GitHub: `design/initial-spec`, `feat/core-engine`, `docs/plan-2-playable`, `feat/playable`, `docs/plan-3-spotify`, `feat/spotify` (deletion was blocked by the permission classifier during the build session).
