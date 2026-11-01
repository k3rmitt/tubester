# Spotify setup (host only)

Guests never need Spotify. Only the person hosting logs in, and that account needs **Spotify Premium**.

## 1. Create the Spotify app (once)

1. Open https://developer.spotify.com/dashboard and **Create app**.
2. Name: `TUBESTER`. Description: anything.
3. Redirect URIs (exactly, with the trailing slash):
   - `https://k3rmitt.github.io/tubester/`
   - `http://127.0.0.1:5173/tubester/`
4. APIs used: **Web API** and **Web Playback SDK**.
5. Save, then copy the **Client ID** (it is public, not a secret).

The app stays in Development Mode: the app owner needs Premium, and up to 5 Spotify accounts can host. Add each host under **User Management** (name + Spotify account email).

## 2. Run locally with Spotify

    echo "VITE_SPOTIFY_CLIENT_ID=<your client id>" > .env.local
    npm run dev -- --host 127.0.0.1

Open http://127.0.0.1:5173/tubester/ in desktop Chrome (not `localhost`: Spotify only accepts the loopback IP).

## 3. Production

    gh variable set SPOTIFY_CLIENT_ID --body "<your client id>" -R k3rmitt/tubester

Then any push to `main` deploys to https://k3rmitt.github.io/tubester/.

## Limits to know

- Only playlists you **own or collaborate on** can be imported. To use a Spotify or friend's playlist, open it in Spotify and **Add to other playlist → New playlist** (or "Save as copy").
- Importing checks each song's first release year on MusicBrainz at about one song per second, so a 100-song playlist takes ~2 minutes the first time (cached afterwards).
