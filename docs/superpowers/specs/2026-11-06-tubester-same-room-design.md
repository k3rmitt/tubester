# TUBESTER — Same-room mode (design)

Status: draft for approval · 2026-11-06

## Why

Today the music plays in the host's tab and is streamed to every guest's phone by sharing the tab with its sound. That only works from desktop Chrome or Edge. On an iPhone (any browser) screen sharing never carries sound, and Spotify's in-browser player does not run on phones or tablets at all. A user tried to host from iOS Chrome and got "No audio was shared".

When everyone is in the same room, nobody needs the sound on their own phone: one device plays the music out loud. This mode removes the sound streaming, and with Spotify Connect it lets the host run the game from any device, phones included.

## Goals

- A host chooses where the music is heard: **On everyone's phone** (today's behaviour) or **In the room** (new).
- In the room + Spotify: TUBESTER drives a Spotify Connect device chosen by the host (the Spotify app on the host's phone, a computer, a Sonos, a TV, a smart speaker…). No tab capture, no Web Playback SDK needed.
- In the room + Demo tones: the tones play out of the host device's own speaker.
- Hosting in the room works from a phone (iOS Safari/Chrome, Android Chrome) and from any desktop browser.
- Everything else in the game is unchanged: rules, turns, steal window, pause/resume, reveal, end game, reconnects, host reload.

## Non-goals

- No other music service (Apple Music, YouTube…).
- No mixing: a game is either all in the room or all streamed.
- No volume control, no queue or crossfade, no choice of where in the song to start (it starts at 0 as today).
- Not hiding the title on the playing device (Spotify shows it; we can't change that). We warn instead.

## Anti-goals

- The song in play must never reach guests before the reveal. This mode sends guests **less** than before (no audio stream), never more.
- On-everyone's-phone mode must keep working exactly as today on desktop Chrome/Edge.

## The host's flow

### Lobby: the Music panel

Two choices, in this order:

1. **Where will people hear the music?**
   - **In the room** — "One device plays the music out loud. Everyone must be in the same room."
   - **On everyone's phone** — "The music plays here and is streamed to each phone. Needs Chrome or Edge on a computer."
2. **Music source:** Demo tones / Spotify (as today).

Default: **In the room** on phones and tablets, and on desktop browsers that can't capture tab audio; **On everyone's phone** on desktop Chrome/Edge. The choice is remembered (localStorage, like the music source). *(Builder's call:)* both choices always stay selectable — a wrong device guess must never lock anyone out. On a device that looks like it can't stream (no `getDisplayMedia`, or a phone/tablet: `navigator.userAgentData.mobile`, an iPhone/iPad/Android user agent, or a Mac user agent with touch points > 1), **On everyone's phone** only carries the note "Needs Chrome or Edge on a computer".

### In the room + Spotify

Steps after "Log in with Spotify", playlist import and year review (unchanged):

- **Play on:** a select listing the account's Spotify Connect devices (`GET /me/player/devices`), by name and type ("Hervé's iPhone · Smartphone"). A **Refresh** button re-reads the list.
- Help text under it: "Don't see your device? Open the Spotify app on it, play anything for a second, then tap Refresh."
- If the list is empty: the same help text, shown as the main message.
- Warning, always shown in this mode: "The song name shows on the device that plays. Keep it out of sight, or pick a playlist you don't know well."
- The music is **ready** when a device is picked and the playlist has songs. No broadcast step.
- The picked device is remembered by id (localStorage) and preselected next time if it is still listed.

The device list is read when this panel appears and on **Refresh**; there is no extra check when the game starts — a stale device is handled by the in-game recovery below.

The login asks for one more Spotify permission, `user-read-playback-state` (needed to list devices). Existing logins lack it: if listing devices returns 401/403 for scope, show "Log in to Spotify again to see your devices" with a log-in button. The mode, music source, imported playlist and year review are already in localStorage, so they survive the login redirect.

In this mode the Web Playback SDK player is **not** started, so it can't fail on phones. (In on-everyone's-phone mode it starts as today.)

### In the room + Demo tones

The tones play through the host device's speaker (the tone feed is connected to the audio output). No audio track is given to the transport, so no media call goes to guests. The existing **Enable sound** banner covers browsers that block audio until a tap.

### During the game

- Each turn, TUBESTER asks the chosen device to play the track (`PUT /me/player/play?device_id=…` with the track uri), exactly like it does today for the in-tab player. Pause, resume and stop use the same calls with that device id.
- The game runs on its own timers, as today; it never waits for a track to end. A song that ends before the turn does just leaves silence (same as today).
- A play call that fails with 404 "no active device" (idle or asleep device) first tries to wake it: transfer playback to the device (`PUT /me/player` with `device_ids: [id]`, `play: false`), then play once more. *(Builder's call.)*
- If it still fails (device gone, app closed…), the existing **Music stopped** panel appears with the message "Can't reach <device name>. Open Spotify on it, then try again." and **Try again**. Try again re-reads the device list; if the picked device is back, it plays the current song again (with the same wake-up step).
- The host screen asks to stay awake (Wake Lock) while a game runs, as guests already do.
- *(Builder's call:)* if the host's tab is hidden during a game in this mode (app switch, screen lock), the host pauses the game automatically (the existing pause, "Paused by <host name>"), so the steal window and the music don't run on while the host is away. Anyone resumes as usual. On a phone, the host board shows once per game: "Keep TUBESTER open in front: switching apps pauses the game for everyone."

## The guests' side

- Guests are told the music is in the room: the lobby carries `musicInRoom: true` — *(builder's call)* a boolean field on `Lobby`, outside the numeric `LobbySettings`, saved with the host's state so it survives a host reload. The picked Spotify device id stays on the host (localStorage) and is never sent to guests.
- Guests don't get a "Tap to enable sound" banner in this mode, and no audio stream is sent to them.
- Where the play panel today shows the playing state, it says "Listen to the room" in this mode. The countdown / playing / paused states stay as they are.
- Nothing about the current song is added to what guests receive.

## The tutorials

- Host tutorial step 1 ("Host on this computer") becomes about the choice: "Host from a computer or a phone. **In the room**, one device plays the music out loud. **On everyone's phone**, the music is streamed to each phone from Chrome or Edge on a computer."
- Host step 3 ("Share this tab's sound") says it only applies to on-everyone's-phone mode.
- Home's subtitle stops saying "Host on this computer": "A music timeline party game. Host it, friends join from their phones."

## What stays the same

- Room codes, joining, teams, lobby settings, rules, timers, steal window, pause/resume, end game, reconnects, host reload/restore.
- Spotify development-mode limits: host account must be Premium and one of the 5 allowed users.
- The secrecy rule: only `HostRuntime.viewFor` output goes to guests.

## Left to the builder

- How the Connect player is structured (a second `MusicSource` next to `SpotifyMusicSource`, sharing the API calls, is the obvious fit), and how the mode reaches `HostApp`/`MusicPanel`.
- Exact layout of the Music panel at 360 px.

## Testing

- Unit: the Connect source (play/pause/resume/stop on the chosen device id, error mapping for 404/403, re-play on retry, pause arriving during a play request), device listing in the API, mode default per device capability, `musicInRoom` reaching guests, no audio track set in the room mode.
- e2e (demo tones, as today): a game in the room mode — guests see "Listen to the room", no sound banner, the game plays through a turn.
- Manual (`docs/manual-test.md`): host from an iPhone with the Spotify app as the device; host from a desktop with a Sonos/phone as the device; app closed mid-game → Music stopped → reopen → Try again.
