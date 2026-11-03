# TUBESTER — First-run tutorials (design)

Date: 2026-11-03. Approved from the clickable preview in `mockups/2026-11-03-tutorial/tutorial.html`. The copy in that preview is the agreed text.

## Why
New players and hosts don't know the rules or the setup steps. A short, skippable tutorial right after the splash fixes that without slowing down people who already know.

## What
- **Two tutorials**, each with 6 steps:
  - **participant**: listen, place it, name it, steal, tokens, win
  - **host**: your computer is the stage, music, broadcast, invite, run the game, the rules
- **When:** after the splash, the first time TUBESTER is opened on this device for that role.
  - An invite link (`#/join/…`) gets the participant tutorial.
  - The home page and `#/host` get the host tutorial.
  - It never shows when the splash is skipped (Spotify login return, host reload into a game).
- **Seen per role, per device** (localStorage `tubester.tutorial`). Finishing or skipping marks it seen. A host who later joins as a guest still gets the participant tutorial once.
- **Skip tutorial** is always visible at the top. **Back / Next**, step dots, and **Let's play** on the last step.
- The host tutorial's last step offers **See the players' tutorial**, which switches to the participant tutorial.
- **How to play** link, to replay the tutorial (my call):
  - on the home page: host tutorial
  - on the guest join form and in the guest lobby: participant tutorial
  - in the host lobby: host tutorial
- **Layout:** a full-screen layer above the app and under the splash. It works at 360 px. On a wide screen the host steps put the picture beside the text.
- **Accessibility:** `role="dialog"`, focus on Next, and Escape skips.
- **Rule values in the text:** "10 cards by default", "1 token" to skip, "3 tokens" to buy.

## Constraints
- No emoji; app colours and fonts; CSS only.
- The app keeps loading and connecting behind the tutorial (like the splash).
- The e2e helpers skip the tutorial.

## Build steps
1. Pure helpers in `src/ui/tutorial.ts`, with unit tests first:
   - `tutorialFor(route): 'host' | 'player'`
   - `shouldShowTutorial({ role, seen, splash }): boolean`
   - `readSeen(storage)` and `markSeen(storage, role)`, which never throw
   - `HOST_STEPS` and `PLAYER_STEPS` (the copy)
2. A `Tutorial` component, wired into `App` after the splash, with **How to play** links.
3. e2e helpers click **Skip tutorial**; a new e2e checks the participant tutorial shows once and the skip works. Screenshots at 360 px and on desktop.
