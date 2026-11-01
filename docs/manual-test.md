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
