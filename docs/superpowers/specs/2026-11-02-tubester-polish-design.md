# TUBESTER — Polish after the first real-user test (design)

Date: 2026-11-02. Extends `2026-11-01-tubester-design.md` (the binding spec); where they differ, this document wins.

## Why

The first game with real people worked, but it showed rough edges:

- A player stepped away and the group had no way to stop the song and the clock.
- 5 s was too short to decide on a steal.
- New players landed on a bare menu, with no welcome.
- The end of the game went by flat.
- Players couldn't see where to tap to place a song.
- The screens felt plain.

The goal is a game that feels finished and is obvious to pick up, without changing the rules.

## Goals

1. **Pause**: anyone can pause and resume the game at any moment; pausing also pauses the music.
2. **Steal window**: defaults to **30 s**.
3. **Welcome splash**: an animated logo when the app opens.
4. **End-of-game card**: winners and losers each get their own animated card.
5. **Clearer slots**: unmistakable tap targets for "put the song here".
6. **Album covers**: shown on timeline cards and at the reveal.

Item 5 of the original feedback ("too many No match") is handled separately in PR #5 (MusicBrainz retries) and is out of scope here.

## Non-goals

- No change to game rules, scoring or protocol beyond what pause needs.
- No sound effects or music for the splash or the end card.
- No automatic pause when a player disconnects.
- No pause in the lobby (nothing is playing there).
- No artist + title search on MusicBrainz.

## Anti-goals (a failure even if it works)

- **An album cover, or any track data, reaching a screen before the reveal.** The current track's cover is as secret as its title. This is the same rule as `HostRuntime.viewFor` today.
- A splash that slows down regular players: it must be skippable and short.
- A paused game that changes state, for example a steal landing or the reveal timer firing.
- Breaking guests at 360 px wide or 44 px tap targets.

## Agreed design

Mockups agreed during brainstorming live in `docs/superpowers/specs/mockups/2026-11-02-polish/`. They are HTML fragments; they render in any browser with plain styling, and the brainstorm frame only added the page chrome.

### 1. Pause

- **Who:**
  - Any player can pause, on a guest phone or on the host screen.
  - Any player can resume, not only the one who paused.
- **When:** any time during a game: the countdown, deciding, the steal window, or the reveal. There is no pause in the lobby or once the game is finished.
- **What freezes:**
  - The music pauses at its current position and resumes from there; it does not restart the song.
  - Every running clock stops and later continues with the time it had left: the 3 s countdown, the steal window and the 5 s reveal.
  - Game moves are rejected while paused: place, lock in, skip, steal and buy. So are the host's Pass turn and Next.
  - The host's **New game** still works. It ends the pause and the game.
- **What people see:**
  - A **Pause** control that is always reachable during a game, on every phone and on the host screen, with a 44 px tap target.
  - While paused, a full-screen cover on every screen reads "Paused by ⟨name⟩", with a large **Resume** button. ⟨name⟩ is the player's own name. The host is a player too (it always has a team), so a pause from the host screen shows the host's name.
- **Persistence:**
  - If the host reloads while paused, the game comes back paused.
  - A guest who reconnects sees the pause cover immediately.
- **Broadcast:** tab capture keeps running while paused (silence goes out); guests stay connected.
- **Clocks on phones:** every phone's countdown must stop and restart in step with the host. The `state` message may change to carry the time left (or a frozen deadline). Older saved games restore as not paused (my call).
- **Pause before the music starts:** a pause during the 3 s countdown, or before playback has really begun, keeps the track waiting; resume then starts it (my call). Adding a resume path to the Spotify source (SDK `resume`, or `play` with `position_ms`) is allowed.

### 2. Steal window

- The default becomes **30 s**.
- The allowed range goes from 2–15 s to **2–60 s** (my call).
- The original spec's settings line ("steal window (5 s)") is superseded.

### 3. Welcome splash

The final frame is in `mockups/…/splash.html`; it is the "medium" option.

- **Stage:**
  - Dark background with a soft radial glow.
  - A vinyl record of about 150 px in the centre, spinning: grooves, plus a separate yellow (`#FFD23F`) centre label with a hole, sitting above everything except the final logo.
- **Words in (2.4 s):**
  - "TUBE" (off-white `#F2F0EA`) starts above the record and "STER" (yellow) below it. These are the app's logo colours (`Wordmark`).
  - Both spiral clockwise for 1.5 turns, staying opposite each other.
  - Each word's letters stay oriented to the record's centre (the word sits tangent to its orbit). The words shrink as they go and pass over the grooves.
  - They disappear **underneath the yellow centre label**.
- **Logo:**
  - TUBE**STER** pops out of the centre once (scale 0.4 → 1 with a small overshoot, about 0.45 s) on an opaque dark plate.
  - A rounded yellow outline then **draws itself** around the plate (about 0.8 s).
  - The plate must fully cover the yellow label (a bug in an earlier mockup).
  - No blinking or flashing.
- **Tagline:** "You know, You knew it", exactly as written, in muted text under the logo, fading in after the outline.
- **Length and exit:**
  - About 4 s in total, then it moves on to the screen the link was for: home, join or host.
  - A tap anywhere skips it.
- **Joining is not delayed:** on an invite link, connecting to the room starts behind the splash, so it adds no waiting (my call).
- **When it plays:** every time the app is opened, including from an invite link. Exceptions (my calls):
  - not on the return from the Spotify login redirect;
  - not when the host page reloads into a game in progress;
  - with `prefers-reduced-motion`, a still final frame for about 1.5 s.

### 4. End-of-game card

The agreed style is option C, "Spotlight", in `mockups/…/end-of-game.html`.

- **When it shows:** when the game reaches `finished`, as a modal card over the board on every phone and on the host screen. Every screen belongs to a team, the host's included (the host always plays), so each screen gets the winner or the loser version for its own team. There are no spectators.
- **Text:**
  - The viewer's team won: **"You win!"**, in yellow.
  - Another team won: **"⟨Team name⟩ wins!"**. "wins" is my call; the request said "win". The winning team's name uses the app's other-team colour.
  - Ties: the deck can run out with tied leaders (`winnerIds` has several teams).
    - If the viewer's team is among the winners, it still reads "You win!".
    - Otherwise it lists the names, e.g. "Vinyl and Cassette win!" (my call).
  - A short line under the title gives the card count (my call on exact wording).
- **Animation:**
  - Winners: a yellow spotlight sweeps onto the card (about 1.4 s), a light sprinkle of yellow confetti falls, and the card has a yellow glow.
  - Everyone else: the screen dims (about 35 % darker) and the card pops in calmly, with no confetti.
- **Closing:** **See the timelines** closes the card and leaves today's finished screen, where the host's New game remains.
  - Closing is per device.
  - A device that reconnects into a finished game shows the card again (my call).
- `prefers-reduced-motion`: no sweep or confetti; the card simply appears.

### 5. Clearer slots

The agreed style is option A in `mockups/…/slots.html`.

- **Tappable slots** for this viewer:
  - Look: a solid 2 px yellow outline, a light yellow tint, the label in yellow (weight 600), and a round yellow **"+"** badge of about 26 px on the left. At least 44 px tall (46 px in the mockup).
  - Tappable means placing during your own turn, or choosing a steal slot.
- **The chosen slot** fills solid yellow with dark text, and the badge colours flip.
- **Steal colour:** the same treatment in the steal orange (`#FF8A4C`) when choosing a steal slot. This keeps today's colour code (my call).
- **Non-tappable slots:** keep their current look: someone else's pick, a taken slot, or spectating the active team's timeline.
- **Hint:** the line above the timeline on your turn reads "Tap a yellow spot to place the song" (my call on wording).

### 6. Album covers

The agreed style is A + C in `mockups/…/covers.html`.

- **Timeline cards:** a 44 px rounded square cover at the left of every timeline card.
- **While a song plays:** a "?" sleeve stands in for its cover.
- **At the reveal:** the cover appears large, about 150 px, above the year, title and artist.
- **Source:**
  - Spotify album images from the playlist load (`album.images`).
  - Pick the smallest image of at least 300 px, or the largest available.
  - Keep it with the track through the year review and the saved review.
- **Secrecy:** the cover URL travels exactly like title and artists. It is in `TrackMeta`, appears in `CardView` and `RevealView`, and never appears for the current track before the reveal.
- **Fallback:** if there is no cover, an image fails to load, or the track is a demo track, show a neutral placeholder sleeve, a dark square with a small record mark (my call). Older saved reviews without covers also get the placeholder.
- **Unverified:** that `album.images` is still returned for `/playlists/{id}/items` in Spotify Development Mode (Feb 2026 rules). The placeholder path must make the feature degrade gracefully if it isn't.

## Constraints

- Everything in `CLAUDE.md` applies:
  - TDD.
  - Guests are untrusted: new intents (`pause`, `resume`) go through `parseIntent` and `HostRuntime.handleIntent`.
  - No "Hitster" anywhere.
  - Branch plus PR, never commit to `main`.
- Pure P2P, no server. Pause state is decided by the host, like every other game state.
- The engine reducer stays pure. Pause can live in the runtime and session (timers, music) rather than in the rules engine. Where it lives is the builder's call; it must survive `serialize`/`restore`.
- The app's look: ground `#0F1115`, surface `#1A1D24`, Space Grotesk + Inter, no emoji. Animations use CSS only, with no new animation library.
- `MusicSource` gains pause/resume (or an equivalent). It must work for both Spotify (Web Playback SDK `pause`/`resume`) and the demo tone source.

## Left to the builder

- Order of work and how to split it into commits or PRs. Suggested: steal default, slots, covers, end card, splash, then pause, from smallest to largest.
- Exact protocol and view shapes, for example an `AudioState` value of `paused` versus a separate field.
- How the countdown is paused and resumed.
- Component structure, CSS class names, and exact animation timings within the ranges above.
- Placement of the Pause control, as long as it is always reachable on a 360 px phone and doesn't crowd the TUBESTER! button.

## Addendum (2026-11-02, after reviewing the branch): steals and ending a paused game

These came from a second round of feedback on the branch. They change rules from the base spec, and this addendum wins over it.

### 7. The steal window ends early

- The steal window closes as soon as **every team that can steal has pressed TUBESTER!**.
  - "Can steal" means every team other than the active team, minus teams with 0 tokens.
  - This is checked again after every steal and after every buy, so a team that buys a card down to 0 tokens during the window stops counting (my call).
- It also closes early when no free slot is left on the active team's timeline (my call).
- If no team can steal when the active team locks in, the reveal comes straight away instead of after the full window (my call).
- Otherwise the timer still applies (default 30 s).

### 8. Steal several slots

- During the steal window, a player selects **several slots**, up to their team's token count, then presses **TUBESTER!** once.
  - Each claimed slot costs 1 token.
  - A team presses TUBESTER! **once per turn**.
  - The phone caps the selection at the token count. The host refuses a press that asks for more slots than the team has tokens, or the same slot twice (my call).
  - Ending the game reuses the engine's existing "most cards wins, ties shared" finish from deck exhaustion.
- **Contested slots:**
  - A slot still belongs to the first team whose press reaches the host. Two teams never hold the same slot.
  - If some of the selected slots were taken first, the press **claims the ones that are still free** and charges only for those.
  - The phone then says how many were taken, e.g. "1 slot was already taken". If none are free, the press is refused at no cost.
- **Who wins the card:** when the active team is wrong, the card goes to the first correct steal in arrival order. One team's slots count in the order they were sent. Today's rule is unchanged.

### 9. End the game while paused

- On the pause screen, **the host** (not guests) sees **End game**.
- Pressing it asks "End the game for everyone?", with **End game** and **Cancel**.
- Confirming finishes the game at once:
  - The winners are the teams with the most cards, with ties shared; the starting card counts.
  - The song in play is discarded and never revealed.
  - Every screen shows the end-of-game card, then the finished screen with the host's **New game**.
- It is the only game action allowed while paused, and it also clears the pause.
