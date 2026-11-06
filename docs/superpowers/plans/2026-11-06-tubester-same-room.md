# Same-room mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host choose "In the room" (one Spotify Connect device plays out loud, no tab sharing, any host device) or "On everyone's phone" (today), and hide demo tones behind a test flag.

**Architecture:** A new `SpotifyConnectSource` (a `MusicSource`) drives a host-picked Connect device through the Web API calls the in-tab source already uses, plus device listing and transfer. The lobby gains a `musicInRoom` boolean that reaches guests and survives host reload; in room mode the host gives the transport no audio track and doesn't start the Web Playback SDK. Pure helpers in `src/ui/musicMode.ts` decide defaults, demo visibility and auto-pause.

**Tech Stack:** TS 7 (native tsc), React 19, Vite 8, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-11-06-tubester-same-room-design.md`

## Global Constraints

- Brand is **TUBESTER**; never "Hitster". No emoji in UI copy.
- The current track's title/artists/year/trackId/cover never reaches guests before the reveal; only `HostRuntime.viewFor` output and the lobby are sent. The picked device id is host-only (localStorage).
- Guests stay mobile-first: 360 px, no sideways scroll, 44 px tap targets. Host screens in room mode must also work at 360 px.
- macOS case-insensitive names: no helper `foo.ts` next to a component `Foo.tsx`.
- TDD; whole suite (`npm test`), `npm run e2e`, `npm run lint`, `npm run typecheck`, `npm run build` green before done.
- Never commit on `main`; branch `feat/same-room`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Exact copy (from the spec):
  - Choice labels: **In the room** — "One device plays the music out loud. Everyone must be in the same room." / **On everyone's phone** — "The music plays here and is streamed to each phone. Needs Chrome or Edge on a computer."
  - Device help: "Don't see your device? Open the Spotify app on it, play anything for a second, then tap Refresh."
  - Title warning: "The song name shows on the device that plays. Keep it out of sight, or pick a playlist you don't know well."
  - Scope: "Log in to Spotify again to see your devices"
  - Device error: "Can't reach <device name>. Open Spotify on it, then try again."
  - Not allowlisted: "This Spotify account can't host yet. Ask the TUBESTER owner to add it."
  - Phone notice: "Keep TUBESTER open in front: switching apps pauses the game for everyone."
  - Guest play panel: "Listen to the room"
  - Home subtitle: "A music timeline party game. Host it, friends join from their phones."
  - Tutorial copy: the spec's "The tutorials" section, verbatim (players' step 1, host steps 1–3).

## Review Focus

1. A save written before this change (lobby without `musicInRoom`) restores as `false`, not `undefined` — test in Task 1.
2. Pause pressed while a Connect `play` request is in flight: the device ends paused — test in Task 3.
3. A remembered `tubester.music` = `demo` with Spotify configured and no flag: the source is Spotify — test in Task 4 (`effectiveSource`).
4. The `?demo` flag survives the URL cleanup `useSpotify` does after load (it rewrites the URL) — test in Task 4 (`readDemoFlag` caches in sessionStorage).
5. Room mode never sets an audio track on the transport, even after a broadcast was started earlier in stream mode — test in Task 5 (`audioTrackFor`).

---

### Task 1: `musicInRoom` on the lobby

**Files:**
- Modify: `src/host/lobby.ts`, `src/host/session.ts`
- Test: `src/host/lobby.test.ts`, `src/host/session.test.ts`

**Interfaces:**
- Produces: `Lobby.musicInRoom: boolean`; `setMusicInRoom(lobby: Lobby, on: boolean): Lobby` (no-op once `started`); `HostSession.setMusicInRoom(on: boolean): void` (updates, saves, broadcasts the lobby).

- [ ] **Step 1: Failing tests**
  - `lobby.test.ts`: `createLobby(host).musicInRoom === false`; `setMusicInRoom(lobby, true).musicInRoom === true`; on a started lobby it returns the lobby unchanged.
  - `session.test.ts` (use the existing memory-hub helpers): after `session.setMusicInRoom(true)`, a connected guest's last `lobby` message has `musicInRoom: true`; a new `HostSession` on the same storage after a started game restores `musicInRoom: true`; a save whose `lobby` lacks the field restores `musicInRoom === false`.
- [ ] **Step 2:** `npx vitest run src/host/lobby.test.ts src/host/session.test.ts` → FAIL (`setMusicInRoom` not defined).
- [ ] **Step 3:** Implement. In `restore()`, `musicInRoom: saved.lobby.musicInRoom === true`. Keep save `v: 1` (additive field). `reset()` keeps the value.
- [ ] **Step 4:** Same command → PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(lobby): musicInRoom flag reaches guests and survives reload`.

### Task 2: Spotify API — devices, transfer, permissions, allowlist message

**Files:**
- Modify: `src/music/spotify/api.ts`, `src/music/spotify/pkce.ts`
- Test: `src/music/spotify/api.test.ts`, `src/music/spotify/pkce.test.ts`

**Interfaces:**
- Produces:
  - `interface SpotifyDevice { id: string; name: string; type: string; isActive: boolean }`
  - `SpotifyApi.devices(): Promise<SpotifyDevice[]>` — `GET /me/player/devices`, drops entries without `id` or with `is_restricted: true`.
  - `SpotifyApi.transfer(deviceId: string): Promise<void>` — `PUT /me/player` body `{ device_ids: [deviceId], play: false }`.
  - `export const NEEDS_RELOGIN = 'Log in to Spotify again to see your devices'`; `devices()` throws `new Error(NEEDS_RELOGIN)` on 403.
  - `export const NOT_ALLOWED = "This Spotify account can't host yet. Ask the TUBESTER owner to add it."`; `me()` throws `new Error(NOT_ALLOWED)` on 403 (so `listPlaylists` surfaces it).
  - `SPOTIFY_SCOPES` gains `'user-read-playback-state'`.
- [ ] **Step 1: Failing tests** (fake fetch as the file already does): `devices()` maps `{devices:[{id:'d1',name:'Kitchen',type:'Speaker',is_active:false},{id:null,name:'x'},{id:'r',name:'R',is_restricted:true}]}` to `[{id:'d1',name:'Kitchen',type:'Speaker',isActive:false}]`; `devices()` on 403 rejects with `NEEDS_RELOGIN`; `transfer('d1')` sends `PUT …/me/player` with that body; `listPlaylists()` when `/me` answers 403 rejects with `NOT_ALLOWED`; `SPOTIFY_SCOPES` contains `user-read-playback-state`.
- [ ] **Step 2:** `npx vitest run src/music/spotify` → FAIL.
- [ ] **Step 3:** Implement (catch `HttpError` with `status === 403`).
- [ ] **Step 4:** PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(spotify): list Connect devices, transfer playback, clearer 403 messages`.

### Task 3: `SpotifyConnectSource`

**Files:**
- Create: `src/music/spotify/connect.ts`
- Test: `src/music/spotify/connect.test.ts`

**Interfaces:**
- Consumes: `SpotifyApi.play/pause/resume/transfer/listPlaylists/loadPlaylist` (Task 2), `HttpError` from `src/util/http`.
- Produces: `export type ConnectApi = Pick<SpotifyApi, 'listPlaylists'|'loadPlaylist'|'play'|'pause'|'resume'|'transfer'>`; `export function cantReach(name: string): string` → `` `Can't reach ${name}. Open Spotify on it, then try again.` ``; `class SpotifyConnectSource implements MusicSource` with `constructor(api: ConnectApi, device: () => { id: string; name: string } | null)`.

Behaviour: `ready()` resolves at once. `play(trackId)`: no device → emit `"Pick a Spotify device to play on"`. Otherwise `api.play(id, trackId)`; on `HttpError` 404 → `api.transfer(id)` then `api.play(id, trackId)` once; any remaining failure → emit `cantReach(device.name)` for that trackId (only if it's still the current track). Pause/resume/stop and the in-flight-pause rule mirror `SpotifyMusicSource` (`src/music/spotify/source.ts`).

- [ ] **Step 1: Failing tests:** plays the track on the picked device id; 404 then success → calls `transfer('d1')` and plays again, no error; 404 twice → one error `{trackId, message: "Can't reach Kitchen. Open Spotify on it, then try again."}`; no device → error `"Pick a Spotify device to play on"`; `pause()` called while `play` is pending → after play resolves, `api.pause('d1')` was called; `stop()` before any play makes no API call; a newer `play` makes the older one's failure silent.
- [ ] **Step 2:** `npx vitest run src/music/spotify/connect.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` green.
- [ ] **Step 5:** Commit `feat(spotify): Connect source plays on a picked device and wakes it when idle`.

### Task 4: Mode helpers

**Files:**
- Create: `src/ui/musicMode.ts`
- Test: `src/ui/musicMode.test.ts`

**Interfaces:**
- Produces:
  - `type Where = 'room' | 'stream'`
  - `interface DeviceEnv { hasDisplayMedia: boolean; uaMobile?: boolean; userAgent: string; maxTouchPoints: number }`
  - `canStream(env: DeviceEnv): boolean` — false when `!hasDisplayMedia`, `uaMobile`, UA matches `/iPhone|iPad|iPod|Android/`, or UA has `Macintosh` and `maxTouchPoints > 1`.
  - `defaultWhere(env: DeviceEnv, stored: string | null): Where` — stored `'room'|'stream'` wins; else `canStream ? 'stream' : 'room'`.
  - `readDemoFlag(search: string, session: Storage | null): boolean` — true if `search` has a `demo` param (then writes `tubester.demo=1` to session) or session already has it; storage errors are swallowed.
  - `demoAllowed(opts: { flag: boolean; spotifyAvailable: boolean }): boolean` — `flag || !spotifyAvailable`.
  - `effectiveSource(stored: string | null, opts: { flag: boolean; spotifyAvailable: boolean }): 'demo' | 'spotify'` — `'spotify'` when available and (stored isn't `'demo'` or demo not allowed); else `'demo'`.
  - `shouldAutoPause(s: { hidden: boolean; inRoom: boolean; phase: string | null; paused: boolean }): boolean` — hidden && inRoom && phase not null and not `'finished'` && !paused.
  - `WHERE_KEY = 'tubester.where'`, `DEVICE_KEY = 'tubester.device'`.
- [ ] **Step 1: Failing tests:** desktop Chrome UA with display media → stream; iPhone UA → room; iPad-as-Mac (`Macintosh`, 5 touch points) → room; no display media → room; stored `'room'` on desktop → room; `readDemoFlag('?demo', s)` true and a later `readDemoFlag('', s)` true; `readDemoFlag('', null)` false; throwing storage → no throw; `effectiveSource('demo', {flag:false, spotifyAvailable:true})` = spotify; `effectiveSource('demo', {flag:true, spotifyAvailable:true})` = demo; `effectiveSource(null, {flag:false, spotifyAvailable:false})` = demo; `shouldAutoPause` true only for hidden+room+`deciding`+not paused (cover finished, paused, stream, visible).
- [ ] **Step 2:** `npx vitest run src/ui/musicMode.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(ui): music mode helpers (where, demo flag, auto-pause)`.

### Task 5: Host wiring

**Files:**
- Modify: `src/ui/HostApp.tsx`, `src/ui/MusicPanel.tsx`, `src/ui/useSpotify.ts`, `src/ui/HostBoard.tsx`, `src/ui/App.tsx` or `src/main.tsx` (call `readDemoFlag(location.search, sessionStorage)` once at startup, before `useSpotify` rewrites the URL), `src/ui/theme.css`
- Test: `src/ui/musicMode.test.ts` (add `audioTrackFor`)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `audioTrackFor(where: Where, source: 'demo'|'spotify', tracks: { feed: MediaStreamTrack|null; capture: MediaStreamTrack|null }): MediaStreamTrack|null` in `musicMode.ts` — `null` for room; `feed` for stream+demo; `capture` for stream+spotify. `useSpotify(opts: { wantPlayer: boolean })` adds `devices: SpotifyDevice[] | null`, `refreshDevices(): void`, `connectSource: SpotifyConnectSource | null` (built when logged in, device read from a ref fed by the picked id), and only creates/connects the SDK `source` when `wantPlayer`.

- [ ] **Step 1: Failing test** for `audioTrackFor` (room returns null even when both tracks exist).
- [ ] **Step 2:** Run → FAIL. **Step 3:** implement it → PASS.
- [ ] **Step 4: Wire the host.**
  - `HostApp`: `where` state from `defaultWhere(env, localStorage[WHERE_KEY])`; source from `effectiveSource`. On change call `session.setMusicInRoom(where === 'room')` (also once when the session opens). Routing effect: room+spotify → `router.use(connectSource)`; always `transport.setAudioTrack(audioTrackFor(...))`. `musicReady` in room+spotify = device picked && tracks > 0; room+demo = true. Picked device id kept in state + `localStorage[DEVICE_KEY]`, preselected if listed. Music-stopped **Try again** in room mode: `refreshDevices()` then `session.retryMusic()`.
  - Wake Lock: request `screen` when a game view appears (host), release on unmount.
  - Auto-pause: `visibilitychange` listener → if `shouldAutoPause(...)` then `session.act({ type: 'pause' })`.
  - `MusicPanel`: a "Where will people hear the music?" fieldset (In the room first) with the spec copy; on `!canStream(env)` the stream option shows "Needs Chrome or Edge on a computer" (still selectable). Source fieldset only when `demoAllowed`. Room+Spotify steps: login, playlist, import, review (unchanged), then **Play on** select (`name · type`; the list is read when this step appears and on **Refresh**), **Refresh** button, help text (shown as the main message when the list is empty), title warning, scope error with a log-in button when `spotify.error === NEEDS_RELOGIN`. No broadcast step in room mode.
  - `HostBoard`: in room mode on a device where `!canStream(env)`, show the phone notice once per game (dismissible).
  - 360 px: Music panel and host board don't scroll sideways.
- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npm run lint` green; check by hand in `npm run dev -- --host 127.0.0.1` with `?demo` at 360 px and desktop.
- [ ] **Step 6:** Commit `feat(host): In the room mode with a Spotify Connect device; demo tones behind ?demo`.

### Task 6: Guests, copy and tutorials

**Files:**
- Modify: `src/ui/components.tsx` (`NowPlaying` gets `inRoom?: boolean`), `src/ui/PlayPanel.tsx` (passes `musicInRoom`), `src/ui/GuestApp.tsx`, `src/ui/HostBoard.tsx`, `src/ui/Home.tsx`, `src/ui/tutorialContent.ts`, `src/ui/Tutorial.tsx` (art for step 1)
- Test: `src/ui/tutorialContent.test.ts`

- [ ] **Step 1: Failing tests** (copy from the spec's "The tutorials" section, verbatim): `PLAYER_STEPS[0]` title "Listen to the song" and its body; `HOST_STEPS[0]` kicker/title/body; `HOST_STEPS[2]` kicker "3 · Sound", title "Choose where the music plays" and its body; no host body contains "this computer" or "Demo tones".
- [ ] **Step 2:** `npx vitest run src/ui/tutorialContent.test.ts` → FAIL. **Step 3:** update `tutorialContent.ts`, the step-3 art in `Tutorial.tsx` (two chips: "In the room" marked `me`, "On everyone's phone"; replaces the "Share this tab" art), and the Home subtitle → PASS.
- [ ] **Step 4:** `NowPlaying` shows "Listen to the room" as the kicker's second line when `inRoom` (states unchanged); guests pass `snap.lobby?.musicInRoom`, host passes `snap.lobby.musicInRoom`. Guests never show "Tap to enable sound" when `musicInRoom`.
- [ ] **Step 5:** `npm test` green. Commit `feat(ui): guests see Listen to the room; copy for hosting from any device`.

### Task 7: End-to-end and docs

**Files:**
- Modify: `e2e/game.spec.ts`, `docs/manual-test.md`, `docs/STATUS.md`, `CLAUDE.md` (Commands: mention `?demo`)

- [ ] **Step 1:** `openHost` goes to `./?demo#/` (works whether or not `.env.local` has a Spotify id). Existing tests keep picking **On everyone's phone** explicitly (`getByRole('radio', { name: /On everyone's phone/ })`) and still assert guests get audio.
- [ ] **Step 2: New test** "in the room: guests get no sound and see Listen to the room": host picks **In the room**, two guests join (one phone), start; guests see "Listen to the room", `hasAudio(guest)` is false, no "Tap to enable sound"; one turn completes (place → reveal → Next).
- [ ] **Step 3:** `npm run e2e` → new test FAILS before Task 5/6 wiring is complete (if run on an earlier commit) and PASSES now; all e2e green.
- [ ] **Step 4:** `manual-test.md`: host from an iPhone with the Spotify app as device; desktop host with a Sonos/phone as device; close the Spotify app mid-game → Music stopped → reopen → Try again; non-allowlisted account message. `STATUS.md`: same-room mode shipped, demo hidden behind `?demo`.
- [ ] **Step 5:** Full gates: `npm test`, `npm run e2e`, `npm run lint`, `npm run typecheck`, `npm run build`. Commit `test(e2e): same-room game; docs for same-room mode`.
