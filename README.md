# TUBESTER

A remote music-timeline party game. The host plays songs from their Spotify (or demo test tones), friends join from their phones with a link, and everyone races to build a timeline of release years. Steal with **TUBESTER!**

- Features: pause/resume from any phone, album covers, 30 s steal window by default, animated welcome and end-of-game screens.
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
