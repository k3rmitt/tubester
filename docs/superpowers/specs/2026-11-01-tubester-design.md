# TUBESTER — Design Spec

Date: 2026-11-01
Status: Draft for review

## 1. Goal

A free, browser-based, **remote online** music-timeline party game for friends. A song plays; each team places it on its timeline of release years; correct placements are kept; first team to 10 cards wins. Rules are adapted from the original card game (tokens, skip, steal, buy, naming bonus). The product is branded **TUBESTER**; the steal action/button is **"TUBESTER!"**. The name "Hitster" never appears in the product.

### Constraints & decisions

| Topic | Decision |
|---|---|
| Play mode | Remote online: players in different places, each on their own device |
| Music source | Pluggable `MusicSource`; first implementation is Spotify. Spotify is an implementation detail |
| Spotify account | **Host only**, Premium required. Guests need no account |
| Audio delivery | Host tab plays via Spotify Web Playback SDK; the tab captures its own audio (`getDisplayMedia`) and streams it to guests over WebRTC (validated by spike on 2026-11-01) |
| Host plays too | Yes — the game drives playback; host never sees the track title |
| Songs & years | Any host-accessible Spotify playlist; years corrected via MusicBrainz (earliest release by ISRC); host reviews before play |
| Rules in v1 | Full original rules: tokens (skip, steal, buy), naming bonus, 10 cards to win. Pro/Expert/Coop modes are out of scope |
| Group size | 2–8 devices; solo or teams |
| Architecture | Pure P2P: host browser is the authoritative referee; star topology; PeerJS public broker for signaling only |
| Hosting | Static site on GitHub Pages (account `k3rmitt`); no backend |
| Devices | Host: desktop Chrome/Edge (required). Guests: any modern browser, **mobile-first** |

### Non-goals (v1)

Pro/Expert/Cooperative modes; more than 8 devices (would need an SFU); non-Spotify music sources (interface only); offline play; spectator mode; persistent accounts or stats.

## 2. Architecture

```
            PeerJS public broker (signaling only)
                 ▲             ▲
   ┌─────────────┴──┐     ┌────┴──────────┐
   │  HOST (Chrome)  │◄───►│  GUEST (any)  │  data channel: intents ↑ / state ↓
   │  engine+runtime │────►│               │  audio track: host tab audio ↓
   │  Spotify SDK    │     └───────────────┘
   │  tab capture    │◄───► ... up to 7 guests (star topology)
   └─────────────────┘
```

- Room code = host's PeerJS ID (e.g. `TUBE-7KQ3`); join link `https://k3rmitt.github.io/tubester/#/join/TUBE-7KQ3`.
- Guests connect only to the host. One data channel per guest + the host's captured audio track added to each guest's peer connection.
- NAT traversal: public STUN by default; optional TURN credentials configurable in host settings. Rare strict networks may fail (accepted).

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `engine/` | Pure rules: `apply(state, action) → state \| rejection`. Placement, flip, tokens, skip, buy, steal, naming bonus, win, exhaustion. No I/O, no timers, no randomness except via injected seed/deck | — |
| `host/runtime` | Owns engine state on host; validates guest intents through engine; runs timers (countdown, steal window); persists state to localStorage after each change; produces per-recipient **filtered views** | engine, net, music, match |
| `host/broadcast` | Captures own tab audio; exposes a `MediaStreamTrack`; detects capture ended | — |
| `net/` | PeerJS session (host & guest roles), typed message codec, reconnect with stable `playerId`, ID-reclaim with backoff | peerjs |
| `music/` | `MusicSource` interface; `spotify/` (PKCE auth, playlist import, Web Playback SDK); `fake/` (test source, oscillator audio) | — |
| `years/` | Resolve earliest release year per track via MusicBrainz (ISRC lookup, 1 req/s, IndexedDB cache by ISRC); fallback to source date with a flag | — |
| `match/` | Fuzzy title/artist matcher (normalize case/accents/punctuation, strip `(Remastered …)`, `- Live`, `feat.`, `&`/`and`, Levenshtein-ratio threshold) | — |
| `ui/` | React screens & components, CSS modules, responsive | all above via hooks |

### `MusicSource` interface

```ts
interface Track { id: string; title: string; artists: string[]; isrc?: string; sourceYear: number; cover?: string }
interface MusicSource {
  listPlaylists(): Promise<PlaylistSummary[]>
  loadPlaylist(id: string): Promise<Track[]>
  ready(): Promise<void>            // player device ready
  play(trackId: string): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>            // keep the position
  resume(): Promise<void>
  onError(cb: (e: PlaybackError) => void): void
}
```

## 3. Game flow

### Setup (host)
1. Log in with Spotify; pick a playlist.
2. Year resolution runs (progress bar, ~1 s/track, cached). **Year review** screen: list with resolved year, Spotify year, ⚠ flag on mismatch/no match; host can edit a year or exclude a track.
3. Settings: cards to win (default 10), starting tokens (2), token cap (5), steal window (30 s, 2–60), buy cost (3).
4. **Start broadcast** → Chrome share dialog → "this tab".
5. Share join link. Guests enter a name. Host assigns teams (default: everyone solo). Host starts the game.

### Start
Deck = shuffled reviewed tracks. Each team receives one face-up card. Team with the oldest starting card plays first; turn order rotates thereafter.

### Turn
1. **Play** — host draws next track; 3 s countdown on all screens; track plays until the reveal.
2. **Decide** (active team, no time limit) — any member may:
   - **Skip** (−1 token): track discarded, next track plays (same team's turn).
   - **Place**: pick a slot on own timeline (0..n).
   - **Name it** (optional): type title + artist.
   - **Lock in**.
3. **Steal window** (5 s) — every other team with ≥1 token may first select a free slot (≠ active team's slot, ≠ other stealers' slots) on the active team's timeline, then press **TUBESTER!** to confirm; −1 token each. Order = arrival order of the TUBESTER! press at host. A press whose slot was taken in the meantime is rejected (no token spent) and the player may pick another slot.
4. **Reveal** — title, artist, resolved year shown to all.
   - A slot is correct if `left.year ≤ year ≤ right.year` (equal years valid on either side).
   - Active team correct → card joins their timeline; all stealers' tokens are lost.
   - Active team wrong → first stealer (arrival order) with a correct slot inserts the card into **their own** timeline at the correct position; else card discarded.
   - Naming bonus: if both title and artist match → active team +1 token (capped), independent of placement.
5. **Win check** — first team whose timeline reaches the target (starting card counts) wins. Otherwise next team.

### Buy
Any team except the active one (during its own turn), any time except during reveal: −3 tokens → host draws the next deck track and inserts it at its correct position on the buyer's timeline (no guessing). Does not consume the current turn's track.

### End conditions
Target reached (winner). Deck exhausted → longest timeline wins; ties shared.

### Engine state (sketch)

```ts
type Phase = 'lobby' | 'countdown' | 'deciding' | 'stealWindow' | 'reveal' | 'finished'
interface GameState {
  settings: Settings
  teams: Team[]                 // { id, name, playerIds, timeline: Card[], tokens }
  deck: TrackId[]; discard: TrackId[]
  turn: { teamId; trackId; slot?; guess?; steals: { teamId; slot; at }[] } | null
  phase: Phase
  winnerIds?: string[]
}
```

### Messages (data channel, JSON)

Guest → host: `hello{playerId,secret,name}` then `intent{intent}` where intent is one of `skip`, `place{slot}`, `lockIn{guess?:{title,artist}}`, `steal{slot}`, `buy`, `pause`, `resume` (validated by the host runtime, then the engine). Player ids are public (they appear in views); the per-device `secret` (kept in the guest's localStorage) is required to reclaim a player id, so nobody can act as someone else.

Host → guest:
`lobby{lobby}` before the game starts; `state{view,lobby,audio,stealWindowMs}` — full filtered view after every change (small; no diffing); `audio` is `countdown|playing|paused|stopped` so screens can show the countdown. The view carries `paused{by}` and `timerLeftMs` so every phone's countdown follows the host's clock. Pause, covers, splash and end card: see `2026-11-02-tubester-polish-design.md`.
`rejected{reason}`.

**View filtering:** before reveal, the current track's `title`, `artists`, `year` are absent from every view, including the host UI's own view. Known caveat: the host's tab holds the data in memory (devtools cheating possible; accepted among friends). Host's own taps have no network delay (slight steal-race advantage; accepted).

## 4. Spotify, broadcast, failures

### Spotify (host)
- Authorization Code with PKCE from the static page (no secret). Scopes: `streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative`. Silent refresh before the 1 h expiry.
- Web Playback SDK registers a device "TUBESTER"; playback via `PUT /me/player/play?device_id=…` with the track URI. SDK metadata is never rendered.
- One Spotify developer app in development mode; host account allowlisted; redirect URI = GitHub Pages URL (+ `http://127.0.0.1:5173` for dev).
- Spotify-owned editorial playlists are not readable by new apps; the picker states this and suggests copying them into the user's library.

### Broadcast
`getDisplayMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }, video: true, preferCurrentTab: true, selfBrowserSurface: 'include', suppressLocalAudioPlayback: false })`. The video track is kept but disabled. Guest latency ~0.2–0.5 s (no sync needed beyond countdown).

### Failure handling

| Case | Behavior |
|---|---|
| Track fails to play | Auto-skip to next track; no token cost |
| Deck exhausted | Game ends; longest timeline wins |
| Capture ended ("Stop sharing") | Game keeps running (no pause, decided 2026-11-02); host sees a **Resume broadcast** banner and can **Pass turn** |
| Guest disconnects | Team state kept; reconnect with same `playerId` (localStorage) restores view + audio |
| Active team fully offline | Host sees **Pass turn** |
| Host reloads | Restore state from localStorage; reclaim same PeerJS ID with backoff; guests auto-retry up to 2 min; host re-shares tab |
| MusicBrainz miss/down | Fallback to Spotify year; flagged ⚠ in review |
| Unsupported host browser | Setup blocks with an explicit message |

## 5. Responsive & mobile

- Mobile-first: single column ≥360 px; two columns (own timeline + scoreboard) ≥768 px; board view ≥1024 px. No horizontal page scroll.
- Own timeline on mobile: vertical list oldest→newest; slots are full-width tap targets (≥44 px) labelled "between 1984 and 1991". Desktop: horizontal cards with clickable gaps. No drag-and-drop.
- Opponents: compact chips (count + years), tap to expand; active team's timeline auto-expands during the steal window.
- Steal: pick a slot, then a large **TUBESTER!** button pinned bottom (thumb zone) with countdown ring.
- Visual reference (approved 2026-11-01): mockup canvas https://claude.ai/artifact/LmoRcUw45fgjfF7nZrs2X3 — guest Join / My turn / Steal / Reveal (390 px), host Setup & year review / Game board (desktop). Look: near-black ground `#0F1115`, surfaces `#1A1D24`, text `#F2F0EA`, muted `#9AA0AC`; yellow `#FFD23F` = you/primary, orange `#FF8A4C` = steal, blue `#5AB0FF` = others/status; Space Grotesk (display) + Inter (body); no emoji.
- Name input: stays above the virtual keyboard; `autocorrect`/`autocapitalize` off.
- Screen Wake Lock during game; remote `<audio playsinline>`; "Tap to re-enable sound" banner if iOS suspends audio.
- Audio unlocked by the **Join** tap (user gesture).
- PWA manifest (installable); no offline support.
- Host UI is responsive too, but hosting requires desktop Chrome/Edge (SDK + tab capture unavailable on mobile).

## 6. Testing

- `engine/`: Vitest, TDD. Placement incl. same-year edges, skip, buy, steal ordering & duplicate-slot rejection, token cap, naming bonus on wrong placement, win, deck exhaustion, turn rotation, team play.
- `host/runtime`: view filter never leaks title/artist/year pre-reveal; steal window with fake timers; persistence round-trip.
- `match/`: table-driven real-world cases (typos, `Guns N' Roses` ↔ `guns and roses`, `(Remastered 2011)`, `feat.`).
- `years/`: recorded MusicBrainz fixtures; no live calls.
- E2E: Playwright, 1 host + 2 guest contexts, `fake` MusicSource + oscillator audio track; mobile viewport runs (iPhone, Pixel).
- Manual checklist: real Spotify login, playback, tab capture, iOS Safari & Android Chrome guests.

## 7. Project layout & delivery

```
src/
  engine/      pure rules + tests
  host/        runtime, broadcast
  net/         peerjs session, messages
  music/       MusicSource, spotify/, fake/
  years/       MusicBrainz resolver + cache
  match/       fuzzy matcher
  ui/          React screens/components, CSS modules
e2e/           Playwright
docs/superpowers/specs/
```

Stack: TypeScript, Vite, React, PeerJS, Vitest, Playwright. Repo on GitHub account `k3rmitt`; GitHub Actions runs lint + unit + e2e, deploys to GitHub Pages from `main`. All changes go through branches/PRs; no direct commits to `main`.
