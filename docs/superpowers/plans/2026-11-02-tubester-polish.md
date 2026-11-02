# TUBESTER Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six fixes from the first real-user test: pause/resume for everyone, a 30 s default steal window, an animated welcome splash, an animated end-of-game card, clearer slot buttons, and album covers.

**Architecture:**
- Pause lives in `HostRuntime`, which already owns intents and the steal/reveal timers. It is not in the pure engine.
  - `HostRuntime` freezes timers with their remaining time and rejects moves while paused.
  - `HostSession` holds the 3 s countdown and pauses or resumes the music through two new `MusicSource` methods.
- Covers ride on `TrackMeta`. `toView` already spreads meta onto timeline cards and the reveal, so a cover follows exactly the same secrecy rule as the title.
- The splash, end card and slot styling are UI-only: CSS animations plus small pure helpers that carry the decisions.

**Tech Stack:** TypeScript 7 (native `tsc`), React 19 (no StrictMode), Vite 8, Vitest 5, Playwright 1.64, Biome.

**Spec:** `docs/superpowers/specs/2026-11-02-tubester-polish-design.md`. Mockups are in `docs/superpowers/specs/mockups/2026-11-02-polish/`. Read both before starting.

## Global Constraints

- Brand is **TUBESTER**. Never write "Hitster" anywhere. The steal button reads **"TUBESTER!"**.
- TDD: write the failing test, watch it fail, implement, then run the whole suite. `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` must be clean before each commit. Run `npm run e2e` at the end of tasks that touch screens.
- Guests are untrusted. New intents go through `parseIntent` and `HostRuntime.handleIntent`. Only `HostRuntime.viewFor` output leaves the host.
- The current track's title, artists, year, trackId **and cover** never reach any view before the reveal.
- Guests: works at 360 px, no sideways scroll, 44 px tap targets.
- Look:
  - Ground `#0F1115`, surface `#1A1D24`, text `#F2F0EA`, muted `#9AA0AC`.
  - Yellow `#FFD23F` for you, orange `#FF8A4C` for steal, blue `#5AB0FF` for others.
  - Space Grotesk + Inter. No emoji.
  - CSS animations only, no new dependencies.
- Every animation has a `prefers-reduced-motion: reduce` variant with no movement.
- Work on branch `feat/polish` from `main`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit to `main`.

## Review Focus

1. **Pause racing a timer:** a pause landing in the same tick as the steal window closing, or the reveal ending, must leave exactly one consistent state. No timer may fire while paused. (Task 7: "a fired-but-cancelled timer does nothing while paused".)
2. **Host reload while paused:** the game comes back paused with the same time left, and resuming starts the track if it hadn't started. (Task 7 restore test; Task 9 "resume after restore starts the countdown".)
3. **Pause just as Spotify starts the track:** a `play` request still in flight when Pause arrives must not leave music playing. (Task 8: "pause during an in-flight play pauses once play lands".)
4. **Cover leak:** the current track's cover must not appear in any view (guest or host) before the reveal, including in `TrackMeta` copies saved to `tubester.host`. (Task 3: "never exposes the current track's cover before the reveal".)
5. **Phone countdown drift:** after a pause and resume in the steal window, phones count down from the host's remaining time, not from the full 30 s. (Task 7: `viewFor` reports `timerLeftMs`; Task 10 uses it.)

---

### Task 1: Steal window defaults to 30 s

**Files:**
- Modify: `src/host/lobby.ts:33-39` (`DEFAULT_LOBBY_SETTINGS`, `LIMITS`)
- Test: `src/host/lobby.test.ts`

**Interfaces:**
- Produces: `DEFAULT_LOBBY_SETTINGS.stealWindowSec === 30`; the `stealWindowSec` limit becomes `[2, 60]`.

- [ ] **Step 1: Write failing tests** in `lobby.test.ts`:

```ts
it('defaults the steal window to 30 s', () => {
  expect(createLobby({ id: 'h', name: 'H' }).settings.stealWindowSec).toBe(30);
});
it('accepts steal windows up to 60 s and clamps above', () => {
  const l = createLobby({ id: 'h', name: 'H' });
  expect(updateSettings(l, { stealWindowSec: 60 }).settings.stealWindowSec).toBe(60);
  expect(updateSettings(l, { stealWindowSec: 90 }).settings.stealWindowSec).toBe(60);
});
```

Adjust any existing test that asserts the old 5 or 15.

- [ ] **Step 2: Run `npx vitest run src/host/lobby.test.ts`.** Expected: FAIL (5 ≠ 30).
- [ ] **Step 3: Change the default to 30 and the limit to `[2, 60]`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS. The e2e already sets the window to 2 s.
- [ ] **Step 5: Commit** with the message `feat(lobby): steal window defaults to 30 s, up to 60 s`.

---

### Task 2: Clearer slot buttons (style A)

**Files:**
- Modify: `src/ui/components.tsx` (`Timeline` slot button markup)
- Modify: `src/ui/theme.css:65-70` (`.slot*` rules)
- Modify: `src/ui/PlayPanel.tsx` (`MyTurn` hint line)

**Interfaces:**
- Consumes: the existing `SlotProps { state; note?; onPick? }`.
- Produces: a slot is "tappable" when `onPick` is set; no type changes.

This task is pure markup and CSS, so its check is visual plus e2e.

- [ ] **Step 1: Markup.**
  - Inside a slot button that has `onPick`, prepend `<span className="slot-plus" aria-hidden="true">+</span>`. The accessible name must still start with "Before", "Between", "After" or "Anywhere"; the e2e relies on it.
  - Add the class `can-pick` when `onPick` is set.
- [ ] **Step 2: CSS** (values from `mockups/…/slots.html`, option A).
  - `.slot.can-pick`:
    - `border: 2px solid var(--me)`, background `rgba(255,210,63,.08)`, `color: var(--me)`, `font-weight: 600`
    - `min-height: 46px`; flex row, `gap: 10px`, `padding: 0 12px`
  - `.slot-plus`: a 26 px circle, background `var(--me)`, color `var(--bg)`, weight 800.
  - `.slot.can-pick.mine`: background `var(--me)`, color `var(--bg)`; the badge inverts.
  - Steal colour: under `.stealing`, the same rules use `var(--steal)`, with a steal-tinted background when chosen.
  - Non-tappable `.free` / `.theirs` / `.taken` slots look as they do today.
- [ ] **Step 3: Hint.** In `MyTurn`, under "Place it on your timeline", add `<span className="muted">Tap a yellow spot to place the song</span>`.
- [ ] **Step 4: Verify.**
  - Run `npm run lint && npm run typecheck && npm test && npm run e2e`. Expected: all pass.
  - Run `npm run dev -- --host 127.0.0.1` and check in a 360 px window: yellow "+" buttons on your turn, orange in the steal window, no sideways scroll.
- [ ] **Step 5: Commit** with the message `feat(ui): make placeable slots obvious (yellow + buttons, orange when stealing)`.

---

### Task 3: Album covers in the data (Spotify → views)

**Files:**
- Modify: `src/music/types.ts` (`Track.cover?: string`)
- Modify: `src/music/spotify/api.ts` (`ApiTrack.album.images`, `pickCover`, `loadPlaylist`)
- Modify: `src/host/review.ts` (`gameTracks` keeps `cover`)
- Modify: `src/host/view.ts` (`TrackMeta.cover?: string`; `CardView` and `RevealView` gain `cover?: string`)
- Modify: `src/host/session.ts:105` (meta includes `cover`)
- Test: `src/music/spotify/api.test.ts`, `src/host/review.test.ts`, `src/host/view.test.ts`, `src/host/session.test.ts`

**Interfaces:**
- Produces:
  - `export function pickCover(images: { url?: string; width?: number | null }[] | undefined): string | undefined` in `api.ts`.
  - `Track.cover?: string`, `TrackMeta.cover?: string`, `CardView.cover?: string`, `RevealView.cover?: string`.

- [ ] **Step 1: Write failing tests.**

`api.test.ts`:

```ts
it('picks the smallest cover of at least 300 px, else the largest', () => {
  expect(pickCover([{ url: 'a', width: 640 }, { url: 'b', width: 300 }, { url: 'c', width: 64 }])).toBe('b');
  expect(pickCover([{ url: 'c', width: 64 }, { url: 'd', width: 200 }])).toBe('d');
  expect(pickCover([])).toBeUndefined();
  expect(pickCover(undefined)).toBeUndefined();
});
it('loads the album cover with each track', async () => {
  // reuse the existing loadPlaylist setup; the track has album.images [{url:'u640',width:640},{url:'u300',width:300}]
  // expect(tracks[0].cover).toBe('u300'); a track without images has cover undefined
});
```

`review.test.ts`: `gameTracks` carries `cover` through from a row that has one.

`view.test.ts`:

```ts
it('never exposes the current track cover before the reveal', () => {
  // game with meta { t1: { title, artists, cover: 'secret.jpg' } } where t1 is the current track, phase deciding/stealWindow
  // expect(JSON.stringify(toView(state, meta, 'A'))).not.toContain('secret.jpg');
});
it('shows covers on timeline cards and at the reveal', () => {
  // timeline card meta cover → card.cover; after closeSteals → view.reveal.cover
});
```

`session.test.ts`: start a game with tracks that have `cover`. Guest `state` messages show covers on the starting timeline cards. No message before the reveal contains the current track's cover.

- [ ] **Step 2: Run the tests.** Expected: FAIL (`pickCover` missing; no `cover` on views).
- [ ] **Step 3: Implement.**
  - `pickCover` ignores entries without a `url`. A missing width counts as 0.
  - `loadPlaylist` sets `cover: pickCover(t.album?.images)`.
  - `gameTracks` copies `cover`.
  - Session meta becomes `{ title, artists, cover }`, omitting `cover` when it is undefined.
  - `toView` needs no change beyond the types: it already spreads meta.
- [ ] **Step 4: Run `npm test && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(covers): carry Spotify album covers from playlist to revealed views`.

---

### Task 4: Album covers on screen

**Files:**
- Modify: `src/ui/components.tsx`
  - new `Cover`
  - `Timeline` card thumbnail
  - `NowPlaying` shows a "?" sleeve instead of `Disc`
- Modify: `src/ui/PlayPanel.tsx` (`Reveal` shows a large cover)
- Modify: `src/ui/theme.css`

**Interfaces:**
- Consumes: `CardView.cover`, `RevealView.cover` (Task 3).
- Produces: `export function Cover({ url, size, label }: { url?: string; size: number; label: string })`.
  - It renders `<img alt={label}>`, which falls back to a placeholder sleeve on a missing URL or `onError`.
  - The placeholder is a dark rounded square with a small record mark; reuse the `Disc` geometry, scaled.

- [ ] **Step 1: Implement `Cover`.** It uses React state `failed`, set from `onError`. The image has `loading="lazy"`, `referrerPolicy="no-referrer"` and `border-radius: 8px`.
- [ ] **Step 2: Timeline cards.**
  - Add `<Cover url={card.cover} size={44} label={`${card.title} cover`} />` at the left of each card.
  - In the horizontal (host board) timeline, put it at the top of the column.
- [ ] **Step 3: Reveal and NowPlaying.**
  - `Reveal`: a ~150 px cover above "It was".
  - `NowPlaying`: a 64 px "?" sleeve in place of `Disc`. It is a dark square with a large muted "?" in Space Grotesk, as in `mockups/…/covers.html` (option C).
- [ ] **Step 4: Verify.**
  - `npm run lint && npm run typecheck && npm test && npm run e2e` all pass. Demo tracks show placeholders.
  - Check at 360 px wide: no sideways scroll, and titles still truncate.
- [ ] **Step 5: Commit** with the message `feat(ui): album covers on timeline cards and at the reveal`.

---

### Task 5: End-of-game card (spotlight)

**Files:**
- Modify: `src/ui/text.ts` (`winnersHeadline`)
- Test: `src/ui/text.test.ts`
- Create: `src/ui/EndCard.tsx`
- Modify: `src/ui/PlayPanel.tsx` (`Finished` renders `EndCard`)
- Modify: `src/ui/theme.css`

**Interfaces:**
- Produces:
  - `winnersHeadline(view): string` (changed copy).
  - `export function endCardTone(view: GameView): 'win' | 'lose'` in `text.ts`.
  - `export function EndCard({ view, onClose }: { view: GameView; onClose: () => void })`.

- [ ] **Step 1: Write failing tests** in `text.test.ts`. Build views with the existing test helpers or literal `GameView`s:

```ts
it('says You win! to the winning team', () => /* viewer in winnerIds */ expect(winnersHeadline(v)).toBe('You win!'));
it('names a single winner with wins', () => expect(winnersHeadline(v)).toBe('Vinyl wins!'));
it('joins tied winners with and', () => expect(winnersHeadline(v)).toBe('Vinyl and Cassette win!'));
it('is the win tone only for a winning viewer', () => {
  expect(endCardTone(winnerView)).toBe('win');
  expect(endCardTone(loserView)).toBe('lose');
});
```

- [ ] **Step 2: Run `npx vitest run src/ui/text.test.ts`.** Expected: FAIL. Today ties are joined with " & " and `endCardTone` doesn't exist.
- [ ] **Step 3: Implement the helpers.** Join with `' and '`; for three or more names, use "A, B and C".
- [ ] **Step 4: Implement `EndCard`** (`mockups/…/end-of-game.html`, option C).
  - A fixed full-screen layer holds:
    - a scrim
    - a centred card: the title, a line `${team.timeline.length} cards`, and a **See the timelines** button that calls `onClose`, with `role="dialog"` and `aria-modal="true"`.
  - Title colour: yellow for the win tone; for the lose tone, `var(--other)` on the winner's name.
  - **Win:**
    - a yellow conic spotlight sweeps from −35° to 0° over 1.4 s (`.end-beam`)
    - about 14 yellow confetti pieces fall (`.end-confetti i` with `--r` rotation and staggered delays)
    - the card has a yellow glow
  - **Lose:** an extra dim layer fades to 0.35 opacity over 1.5 s; the card pops in calmly.
  - Under `prefers-reduced-motion`, the beam and confetti are hidden and nothing moves.
- [ ] **Step 5: Wire it.** In `Finished`, `const [open, setOpen] = useState(true)` and render `{open && <EndCard view={view} onClose={() => setOpen(false)} />}` above the current content.
  - Closing is per device.
  - A remount (page reload or rejoin) shows it again.
- [ ] **Step 6: Verify** with `npm test && npm run lint && npm run typecheck && npm run e2e`.
  - The e2e `WIN` regex `/\bwins?!$/` must still match on every page.
  - If the card's text duplicates the headline and the `getByText` locator becomes ambiguous, use `.first()` or scope the locator to the dialog.
- [ ] **Step 7: Commit** with the message `feat(ui): animated end-of-game card (spotlight for winners)`.

---

### Task 6: Welcome splash

**Files:**
- Create: `src/ui/splash.ts`
- Test: `src/ui/splash.test.ts`
- Create: `src/ui/Splash.tsx`
- Modify: `src/App.tsx`, `src/ui/theme.css`

**Interfaces:**
- Consumes: `SAVE_KEY` from `src/host/session.ts`, and `Route` from `src/ui/router.ts`.
- Produces:
  - `export type SplashMode = 'full' | 'still' | 'none'`
  - `export function splashMode(input: { route: Route; search: string; hasSavedGame: boolean; reducedMotion: boolean }): SplashMode`
  - `export const SPLASH_MS = { full: 4200, still: 1500 }`
  - `export function Splash({ mode, onDone }: { mode: Exclude<SplashMode, 'none'>; onDone: () => void })`

- [ ] **Step 1: Write failing tests** in `splash.test.ts`:

```ts
const home = { name: 'home' } as const;
const host = { name: 'host' } as const;
it('plays in full on home and join links', () => {
  expect(splashMode({ route: home, search: '', hasSavedGame: false, reducedMotion: false })).toBe('full');
  expect(splashMode({ route: { name: 'join', code: 'TUBE-AB12' }, search: '', hasSavedGame: false, reducedMotion: false })).toBe('full');
});
it('is skipped on the return from Spotify login', () =>
  expect(splashMode({ route: host, search: '?code=x&state=y', hasSavedGame: false, reducedMotion: false })).toBe('none'));
it('is skipped when the host reloads into a saved game', () =>
  expect(splashMode({ route: host, search: '', hasSavedGame: true, reducedMotion: false })).toBe('none'));
it('shows a still frame with reduced motion', () =>
  expect(splashMode({ route: home, search: '', hasSavedGame: false, reducedMotion: true })).toBe('still'));
```

- [ ] **Step 2: Run them.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement `splashMode`.**
  - `'none'` when `search` has a `state` param, or when the route is host and there is a saved game.
  - Otherwise `'still'` when `reducedMotion`, else `'full'`.
- [ ] **Step 4: Implement `Splash`** (exact look: `mockups/…/splash.html`). It is a fixed full-screen overlay at z-index above everything, and a `onClick`/`onPointerDown` anywhere calls `onDone`.
  - **Record:** 150 px, grooves `repeating-radial-gradient(circle, #16181d 0 2px, #22252c 2px 3px)`, spinning one turn every 1.6 s.
  - **Label:** a separate 54 px yellow label with a hole and a `0 0 0 3px #0F1115` ring, also spinning. It is stacked above the words.
  - **Words:** "TUBE" (`#F2F0EA`) and "STER" (`#FFD23F`), 40 px Space Grotesk 700, each centred on the record.
    - Keyframes rotate the word around the centre: `rotate(θ) translateY(-r) scale(s)`. TUBE starts at θ=0° and STER at 180°.
    - 1.5 clockwise turns over 2.4 s, starting at 0.2 s, with `r` going 190 px → 0 (ease ≈ `(1-p)^1.15`) and scale 1 → 0.18.
    - Use 16 or more keyframe stops so the path reads as a spiral. The words end hidden under the label.
  - **Logo:**
    - The `Wordmark` (TUBE + yellow STER) sits on an opaque `#0F1115` plate, 12 px 16 px padding, flex-centred on the record.
    - It must fully cover the label.
    - It pops at 2.7 s: scale 0.4 → 1, 0.45 s, `cubic-bezier(.2,1.5,.4,1)`.
  - **Outline:** an SVG `rect` with `pathLength=1`, a 2 px yellow stroke and rx 12, drawn via `stroke-dashoffset` 1 → 0 over 0.8 s from 3.2 s.
  - **Tagline:** "You know, You knew it" (exact copy), 12 px muted Inter, fades in at 3.6 s.
  - **Ending:** `setTimeout(onDone, SPLASH_MS[mode])`.
  - **`still` mode:** render only the final frame (record, plate, outline, tagline) with no animation.
- [ ] **Step 5: Wire it in `App`.**
  - `const [splash, setSplash] = useState(() => splashMode({ route, search: location.search, hasSavedGame: !!localStorage.getItem(SAVE_KEY), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }))`.
  - Wrap the `localStorage` read in try/catch; if it fails, treat it as no saved game.
  - Render the routed screen **and** `{splash !== 'none' && <Splash mode={splash} onDone={() => setSplash('none')} />}`, so joining starts behind the splash.
- [ ] **Step 6: Verify.**
  - `npm test && npm run lint && npm run typecheck && npm run e2e`. Playwright clicks retry while the overlay intercepts them. If that makes the e2e flaky, set `reducedMotion: 'reduce'` on the e2e browser contexts; don't add a test-only bypass in the app.
  - Run the dev server and watch the splash in a 360 px window and on desktop.
- [ ] **Step 7: Commit** with the message `feat(ui): animated welcome splash`.

---

### Task 7: Pause in the host runtime

**Files:**
- Modify: `src/host/runtime.ts`
- Modify: `src/host/view.ts` (`GameView.paused`, `GameView.timerLeftMs`; `toView` sets both to `null`)
- Test: `src/host/runtime.test.ts`

**Interfaces:**
- Produces:
  - `GuestIntent` gains `{ type: 'pause' } | { type: 'resume' }`.
  - `RuntimeDeps` gains `now: () => number`.
  - `GameView.paused: { by: string } | null`, where `by` is a player id.
  - `GameView.timerLeftMs: number | null` is the time left on the steal or reveal timer when the view was built, frozen while paused, and `null` when no timer runs.
  - `HostRuntime.paused: { by: string } | null` (getter).
  - Saved format: `{ v: 2, state, players, paused: { by: string; leftMs: number | null } | null }`. `restore` accepts `v: 1` (unpaused) and `v: 2`.
  - Rejection reasons: `'game is paused'`, `'already paused'`, `'not paused'`, `'nothing to pause'`.

- [ ] **Step 1: Write failing tests** in `runtime.test.ts`.
  - Add a manual clock to `fakeDeps`: `let t = 0; deps.now = () => t; const advance = (ms) => { t += ms; }`.
  - Use the existing helpers to reach each phase.

```ts
it('pauses the steal window and resumes with the time left', () => {
  // reach stealWindow at t=0 (pending [5000]); advance(2000)
  expect(rt.handleIntent('p2', { type: 'pause' })).toEqual({ ok: true });
  expect(pending()).toEqual([]);
  expect(rt.viewFor('p1').paused).toEqual({ by: 'p2' });
  expect(rt.viewFor('p1').timerLeftMs).toBe(3000);
  advance(60_000);
  expect(rt.viewFor('p1').timerLeftMs).toBe(3000);
  expect(rt.handleIntent('p3', { type: 'resume' })).toEqual({ ok: true });
  expect(pending()).toEqual([3000]);
  expect(rt.viewFor('p1').paused).toBeNull();
});
it('pauses during the reveal and while deciding', () => { /* reveal: pending [5000] → [] → resume [left]; deciding: ok, no timers */ });
it('rejects moves and host commands while paused', () => {
  // paused while deciding
  expect(rt.handleIntent('p1', { type: 'place', slot: 0 })).toEqual({ ok: false, reason: 'game is paused' });
  expect(rt.command({ type: 'passTurn' })).toEqual({ ok: false, reason: 'game is paused' });
  expect(rt.handleIntent('p1', { type: 'pause' })).toEqual({ ok: false, reason: 'already paused' });
});
it('rejects resume when not paused and pause once finished', () => { /* 'not paused'; finished → 'nothing to pause' */ });
it('a fired-but-cancelled timer does nothing while paused', () => {
  // keep a reference to the steal timer fn before pausing, call it after pausing → phase still stealWindow
});
it('notifies onChange on pause and resume', () => { /* changes.length grows by 1 each */ });
it('survives serialize/restore while paused', () => {
  // pause in stealWindow with 3000 left → restore(serialize()) → paused, no pending timers, timerLeftMs 3000 → resume → pending [3000]
});
it('restores v1 saves as not paused', () => { /* JSON with v:1 → paused null, timers armed as before */ });
it('rejects unknown players pausing', () => { /* 'unknown player' */ });
```

- [ ] **Step 2: Run `npx vitest run src/host/runtime.test.ts`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `parseIntent` accepts `pause` and `resume`.
  - `handleIntent` treats pause/resume before `toAction`. Every other intent returns `'game is paused'` while paused, and so does `command`.
  - Track `deadline` and `timerMs` when arming. `armTimerForPhase(ms?: number)` uses `ms ?? phase default`.
  - Pause is allowed in `deciding`, `stealWindow` and `reveal`; it stores `leftMs = max(0, deadline - now())` or `null`, then calls `clearTimer()`.
  - Resume re-arms with `leftMs` when it is not null.
  - `onTimer` returns early if paused. This belt-and-braces check covers a cancelled timer whose callback still runs.
  - `viewFor` returns `{ ...toView(...), paused: this.pausedBy ? { by } : null, timerLeftMs }`, where `timerLeftMs` is the frozen `leftMs` while paused, else `max(0, deadline - now())` while a timer runs, else `null`.
  - Bump the saved `v` to 2.
- [ ] **Step 4: Fix callers of `RuntimeDeps`.** `HostSession.runtimeDeps()` passes `now: this.deps.now ?? Date.now`; add `now?: () => number` to `HostSessionDeps`. Update `fakeDeps`.
- [ ] **Step 5: Run `npm test && npm run typecheck`.** Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(pause): pause/resume intents freeze runtime timers and block moves`.

---

### Task 8: Pause in the music sources

**Files:**
- Modify: `src/music/types.ts` (`MusicSource.pause(): Promise<void>`, `MusicSource.resume(): Promise<void>`)
- Modify: `src/music/fake.ts`, `src/music/router.ts`
- Modify: `src/music/spotify/api.ts` (`resume(deviceId)`), `src/music/spotify/source.ts`
- Test: `src/music/fake.test.ts`, `src/music/router.test.ts`, `src/music/spotify/api.test.ts`, `src/music/spotify/source.test.ts`

**Interfaces:**
- Produces:
  - `MusicSource.pause()` and `MusicSource.resume()`.
  - `SpotifyApi.resume(deviceId: string): Promise<void>` sends `PUT /me/player/play?device_id=…` with **no body**, which resumes at the current position.
  - `SpotifyApiLike` includes `'resume'`.

- [ ] **Step 1: Write failing tests.**
  - Fake: after `play('t1')`, `pause()` stops the tone and `resume()` restarts the same frequency. `resume()` with nothing played does nothing.
  - Router: `pause` and `resume` delegate to the current source.
  - api: `resume('dev')` → one `PUT` to `/me/player/play?device_id=dev`, with `init.body` undefined.
  - source:
    - `pause()` calls `api.pause(deviceId)`; `resume()` calls `api.resume(deviceId)` only while a track is current.
    - **Pause during an in-flight play pauses once play lands:** hold `api.play` on a deferred promise, call `pause()`, then settle `play`, and expect `api.pause` to have been called after `play` resolved.
    - `stop()` clears the paused flag.
- [ ] **Step 2: Run the four test files.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Fake remembers the last frequency.
  - Spotify source keeps `paused: boolean`:
    - `pause()` sets it and calls `api.pause` when there is a device.
    - `play()` clears it at the start, and calls `api.pause` after `api.play` if `paused` became true meanwhile.
    - `resume()` clears it and calls `api.resume`.
- [ ] **Step 4: Run `npm test && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(pause): pause and resume in demo and Spotify music sources`.

---

### Task 9: Pause in the host session (countdown and music)

**Files:**
- Modify: `src/host/session.ts`
- Modify: `src/net/protocol.ts` (`AudioState` gains `'paused'`)
- Test: `src/host/session.test.ts`

**Interfaces:**
- Consumes: `HostRuntime.paused` (Task 7), `MusicSource.pause/resume` (Task 8), `HostSessionDeps.now` (Task 7).
- Produces: `AudioState = 'countdown' | 'playing' | 'paused' | 'stopped'`. While paused, `snapshot().audio === 'paused'`, and guests get `audio: 'paused'`.

- [ ] **Step 1: Write failing tests.**
  - Use the existing `setup()`, `fakeTimers` and a manual clock passed as `now`. Make `FakeMusicSource` observable by wrapping `pause`/`resume` in spies, or by checking `ToneOutput` calls.

```ts
it('pausing during the countdown holds it and resumes with the time left', () => {
  // start game (pending includes COUNTDOWN_MS); advance clock 1000; guest sends pause
  // pending no longer includes COUNTDOWN_MS; audio 'paused'; resume → pending includes 2000; fire(2000) → audio 'playing'
});
it('pausing while playing pauses the music; resuming resumes it', () => { /* music.pause called once, then resume */ });
it('the host can pause through act()', () => { expect(session.act({ type: 'pause' })).toEqual({ ok: true }); });
it('guests see paused state and audio', () => { /* last guest state: view.paused.by === 'p1', audio 'paused' */ });
it('resume after restore starts the countdown', () => {
  // pause while playing, new HostSession on the same storage → paused, music not playing, audio 'paused'
  // resume → pending includes COUNTDOWN_MS (track starts again via countdown)
});
it('New game while paused ends the pause', () => { /* reset() → no view, audio 'stopped' */ });
```

- [ ] **Step 2: Run `npx vitest run src/host/session.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Record `countdownStartedAt` when arming the countdown.
  - Add `held: { countdownLeftMs: number | null } | null`.
  - At the top of `syncAudio`:
    - If `runtime.paused` and nothing is `held`: pause. If the countdown is pending, cancel it and store the time left; if audio is `'playing'`, call `music.pause()`. Set audio to `'paused'` and return.
    - If paused and already held: return.
    - If not paused but something is held: resume. If there is countdown time left, re-arm the countdown with it (audio `'countdown'`); else, if `playingTrack !== null`, call `music.resume()` (audio `'playing'`); else, set audio `'stopped'`. Clear `held`, then continue the normal sync, which starts the track if `playingTrack` is null.
  - `stopMusic()` and `reset()` clear `held`.
  - `retryMusic()` does nothing while paused.
- [ ] **Step 4: Run `npm test && npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(pause): session holds the countdown and pauses the music`.

---

### Task 10: Pause on screen and phones count down from the host's time

**Files:**
- Create: `src/ui/Pause.tsx` (`PauseButton`, `PauseCover`)
- Modify:
  - `src/ui/PlayPanel.tsx` (`useCountdown`; `Steal` uses `view.timerLeftMs`)
  - `src/ui/components.tsx` (`NowPlaying` shows "Paused")
  - `src/ui/GuestApp.tsx`, `src/ui/HostBoard.tsx`, `src/ui/theme.css`
- Modify: `e2e/game.spec.ts`

**Interfaces:**
- Consumes: `GameView.paused` and `GameView.timerLeftMs` (Task 7), `AudioState 'paused'` (Task 9), and the lobby players for names.
- Produces:
  - `export function useCountdown(leftMs: number, running: boolean): number` counts down from `leftMs`. It restarts whenever `leftMs` changes and holds still while `!running`.
  - `PauseButton({ view, act })` shows nothing when `phase === 'finished'` or when paused.
  - `PauseCover({ view, players, act })`.

- [ ] **Step 1: The countdown hook.**
  - `Steal` uses `useCountdown(view.timerLeftMs ?? stealWindowMs, view.paused === null)`.
  - The reveal has no visible countdown, so it needs no change.
- [ ] **Step 2: `PauseButton` and `PauseCover`.**
  - **Button:** an icon (two bars, SVG) plus the text "Pause", 44 px tall, in the screen header next to the scores, on guest phones and on the host board. It must not sit in the sticky bottom area, where TUBESTER! lives. It calls `act({ type: 'pause' })`.
  - **Cover:** a fixed full-screen layer at 92 % ground opacity, centred, with `role="dialog"`. It contains:
    - the heading "Paused by ⟨name⟩", where the name comes from `players.find(p => p.id === view.paused.by)?.name ?? 'someone'`
    - a large primary **Resume** button calling `act({ type: 'resume' })`
  - **The host board** shows the same cover over the board. The host's `act` is `session.act`; New game stays reachable, and the cover must not hide the host's top bar.
  - **`NowPlaying`:** when `audio === 'paused'`, the line reads "Paused".
- [ ] **Step 3: e2e.**
  - In the first test, after the first "Mystery track" is visible:
    - Léa clicks **Pause**.
    - Expect "Paused by Léa" on the host page, Léa's page and Marco's page.
    - Marco clicks **Resume**.
    - Expect the cover gone everywhere.
  - Then continue the game as today.
- [ ] **Step 4: Verify** with `npm run lint && npm run typecheck && npm test && npm run e2e`. Expected: all pass.
- [ ] **Step 5: Manual check** with the dev server and two browser windows (one at 360 px):
  - Pause during the steal window; the phone countdown freezes.
  - Resume; it continues from the same second.
- [ ] **Step 6: Commit** with the message `feat(pause): pause button and cover on every screen`.

---

### Task 11: Docs and whole-branch check

**Files:**
- Modify: `docs/manual-test.md` (add pause on real Spotify, covers visible, splash on a phone, end card)
- Modify: `README.md` (feature list, if it lists features)
- Modify: `docs/superpowers/specs/2026-11-01-tubester-design.md`:
  - Setup step 3: steal window 30 s.
  - The `MusicSource` interface sketch gains `pause/resume` and `Track.cover?`.
  - The message list gains the `pause` and `resume` intents and the `paused` audio state.

- [ ] **Step 1: Update the docs** listed above.
- [ ] **Step 2: Run the full gate:** `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`. Expected: all pass.
- [ ] **Step 3: Grep for the forbidden brand:** `git grep -i hitster -- src e2e docs/manual-test.md README.md`. Expected: no output.
- [ ] **Step 4: Commit** with the message `docs: pause, covers, splash and end card in the spec and manual test`.
- [ ] **Step 5: Whole-branch review** by a fresh Sonnet subagent against the spec and the Review Focus list. Fix the findings, then open the PR to `main` as `k3rmitt` (`GH_TOKEN=$(gh auth token -u k3rmitt)`).

---

## Addendum tasks (spec sections 7–9)

Global Constraints and Review Focus above still apply. Extra Review Focus for these tasks:
- **Early close racing the timer:** after the window closes early, the runtime must not fire the old steal timer. `dispatch` already re-arms on a phase change; Task 12 has a runtime test for it.
- **Ending the game must not reveal the song in play:** after `endGame`, no view contains the current track. Task 13 has a test.

### Task 12: Multi-slot steals and early close (engine + runtime + protocol)

**Files:**
- Modify: `src/engine/types.ts` (the steal action becomes `{ type: 'steal'; teamId; slots: number[] }`)
- Modify: `src/engine/game.ts` (`steal`, `lockIn`, `buy`, and a new `stealsDone(s)`)
- Modify: `src/host/runtime.ts` (the `GuestIntent` steal becomes `{ type: 'steal'; slots: number[] }`; `parseIntent` also accepts a legacy `{ slot }`)
- Test: `src/engine/game.steal.test.ts`, `src/host/runtime.test.ts`, plus any test that sends steals (`src/ui/text.test.ts`)

**Interfaces:**
- Produces:
  - Engine `steal` claims the free slots among `slots`, in the order given, at 1 token each.
  - Engine rejections:
    - `'not enough tokens'` when `slots.length` exceeds the team's tokens, or the team has 0 tokens
    - `'invalid slot'` for a malformed slot or a duplicate
    - `'slot taken'` when none of the slots are free
    - `'already stole this turn'`
  - After `lockIn`, a `steal` or a `buy` during `stealWindow`, the engine closes the window by itself when every non-active team has stolen or has 0 tokens, or when no free slot is left.
  - `parseIntent` accepts `slots` as an array of 1–32 numbers.

- [ ] **Step 1: Failing engine tests** in `game.steal.test.ts`:
  - claims several free slots and charges one token each
  - claims only the free ones when some are taken, and charges only for those
  - rejects more slots than tokens, and duplicates
  - `'slot taken'` when none are free, with no token spent
  - closes the window when the last team able to steal presses: phase `reveal` without `closeSteals`
  - closes when no free slot is left
  - reveals at lock-in when no other team has a token
  - closes after a buy drops the last waiting team to 0 tokens
  - keeps the window open while a team with tokens hasn't pressed
  - the first correct slot in arrival order wins, including within one team's list
  - Update existing tests: `slot: n` becomes `slots: [n]`. Drop a now-impossible explicit `closeSteals` after the window has closed by itself. The "needs a token" case now reveals at lock-in.
- [ ] **Step 2: Run `npx vitest run src/engine`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In `steal`, validate first, then claim the free slots. Add `stealsDone(s)` and call it after `lockIn`, after `steal`, and after a `buy` in `stealWindow`; when it returns true, run `closeSteals(s)`.
- [ ] **Step 4: Runtime tests.**
  - The guest intent `{ type: 'steal', slots: [0, 2] }` is accepted.
  - A legacy `{ slot: 0 }` is accepted.
  - `{ slots: 'x' }`, `{ slots: [] }` and a 33-item list are `'malformed intent'`.
  - When the window closes early, the old steal timer is cancelled and a reveal timer of `revealMs` is pending.
- [ ] **Step 5: Run `npm test && npm run typecheck`.** Expected: PASS. Commit with the message `feat(steal): several slots per steal; the window closes once everyone has pressed`.

### Task 13: End the game (engine + runtime + session)

**Files:** `src/engine/types.ts`, `src/engine/game.ts`, `src/host/runtime.ts`; tests in `src/engine/game.end.test.ts`, `src/host/runtime.test.ts` and `src/host/session.test.ts`.

**Interfaces:**
- Produces:
  - Engine action `{ type: 'endGame' }`, allowed in `deciding`, `stealWindow` and `reveal`.
    - It discards the turn's track unless the phase is `reveal`, refunds nothing, sets `lastOutcome = null`, and calls `finishByLongest`.
    - In any other phase it returns `'nothing to end'`.
  - `HostCommand` gains `{ type: 'endGame' }`. It is the only command allowed while paused, and it clears the pause and the timers.
  - `HostSession.endGame(): IntentResult` calls `runtime.command({ type: 'endGame' })`. Audio ends as `'stopped'`.

- [ ] **Step 1: Failing tests.**
  - Engine: ending mid-deciding and ending in the steal window give phase `finished` with the longest timelines as winners (ties shared); the current track is in `discard`; `lastOutcome` is null.
  - Runtime: while paused, `command({ type: 'endGame' })` returns ok; `paused` becomes null; no pending timers; no view contains the current track's title.
  - Session: pause while playing, then `endGame()` gives audio `'stopped'`, phase `'finished'`, and guests receive a `finished` view.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test && npm run typecheck`.** Expected: PASS. Commit with the message `feat(pause): the host can end the game`.

### Task 14: Steal and end-game screens

**Files:** `src/ui/PlayPanel.tsx` (`Steal`), `src/ui/Pause.tsx` (`PauseCover` gains an optional `onEndGame`), `src/ui/HostBoard.tsx`, `src/ui/text.ts` (+ test), `src/ui/theme.css`, `e2e/game.spec.ts`.

**Interfaces:**
- Produces:
  - `export function stealTakenNote(selected: number, claimed: number): string | null` in `text.ts`.
    - It returns `null` when nothing was lost, `'1 slot was already taken'` for one, and `'N slots were already taken'` for more.
  - `PauseCover({ view, players, act, onEndGame? })`.

- [ ] **Step 1: Failing test** for `stealTakenNote`. Run it and watch it FAIL. Implement it and watch it PASS.
- [ ] **Step 2: `Steal` screen.**
  - The selection becomes a `Set<number>`. Tapping toggles a slot. Extra taps beyond `me.tokens` are ignored.
  - The hint reads "Pick up to N slots, then press. 1 token each." TUBESTER! sends `{ type: 'steal', slots: [...selected] }`.
  - After the press, the team's claimed slots show as "your steal". If fewer were claimed than selected, show `stealTakenNote`.
- [ ] **Step 3: End game on the pause screen.**
  - `HostBoard` passes `onEndGame={() => session.endGame()}`; guests pass nothing.
  - The cover shows a secondary **End game** button. Pressing it switches the cover to "End the game for everyone?" with **End game** (danger style) and **Cancel**.
- [ ] **Step 4: e2e.**
  - In the reload test (two players), after the reload check: the host clicks **Pause**, **End game**, then **End game** again to confirm.
  - Expect the end dialog with `WIN` on both pages.
  - Then run the first test unchanged. With 2 s windows it still passes, because early close only shortens waits.
- [ ] **Step 5: Verify** with `npm run lint && npm run typecheck && npm test && npm run e2e`, plus a 360 px check of the steal screen with two slots selected. Commit with the message `feat(ui): pick several steal slots; end the game from the pause screen`.
