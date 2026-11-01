import { useState } from 'react';
import { reviewSummary } from '../host/review';
import { DEMO_TRACKS } from '../music/demo';
import type { SpotifyState } from './useSpotify';

export type MusicMode = 'demo' | 'spotify';
export type BroadcastState = 'off' | 'starting' | 'on' | 'lost';

export function MusicPanel({
  mode,
  setMode,
  spotify,
  broadcast,
  broadcastError,
  onStartBroadcast,
  onReview,
}: {
  mode: MusicMode;
  setMode: (m: MusicMode) => void;
  spotify: SpotifyState;
  broadcast: BroadcastState;
  broadcastError: string | null;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  return (
    <section className="panel">
      <h2>Music</h2>
      <fieldset className="choices">
        <legend className="muted">Music source</legend>
        <label className="choice">
          <input type="radio" name="music" checked={mode === 'demo'} onChange={() => setMode('demo')} />
          Demo tones
        </label>
        {spotify.available && (
          <label className="choice">
            <input type="radio" name="music" checked={mode === 'spotify'} onChange={() => setMode('spotify')} />
            Spotify
          </label>
        )}
      </fieldset>
      {mode === 'demo' && <p className="muted">Demo hits · {DEMO_TRACKS.length} songs, played as test tones.</p>}
      {mode === 'spotify' && (
        <SpotifySteps spotify={spotify} broadcast={broadcast} onStartBroadcast={onStartBroadcast} onReview={onReview} />
      )}
      {spotify.error && (
        <p className="error" role="alert">
          {spotify.error}
        </p>
      )}
      {broadcastError && (
        <p className="error" role="alert">
          {broadcastError}
        </p>
      )}
    </section>
  );
}

function SpotifySteps({
  spotify,
  broadcast,
  onStartBroadcast,
  onReview,
}: {
  spotify: SpotifyState;
  broadcast: BroadcastState;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  const [picked, setPicked] = useState('');
  if (!spotify.loggedIn) {
    return (
      <>
        <p className="muted">Spotify Premium is needed on this computer only. Guests just need the link.</p>
        <button type="button" className="btn primary" onClick={spotify.login}>
          Log in with Spotify
        </button>
      </>
    );
  }
  const summary = reviewSummary(spotify.rows);
  const importing = spotify.progress !== null;
  return (
    <div className="rows">
      <label className="field">
        Playlist
        <select className="input" value={picked} onChange={(e) => setPicked(e.target.value)}>
          <option value="">{spotify.playlists ? 'Pick one of your playlists' : 'Loading playlists…'}</option>
          {spotify.playlists?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.trackCount})
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Only playlists you own or collaborate on can be read. To use someone else's playlist, save a copy to your
        library first.
      </p>
      <button
        type="button"
        className="btn small"
        disabled={!picked || importing}
        onClick={() => spotify.importPlaylist(picked)}
      >
        {spotify.progress ? `Checking years… ${spotify.progress.done}/${spotify.progress.total}` : 'Import playlist'}
      </button>
      {summary.total > 0 && (
        <div className="row">
          <span className="muted">
            {summary.included} songs · {summary.toCheck} to check
          </span>
          <button type="button" className="btn small" onClick={onReview}>
            Review years
          </button>
        </div>
      )}
      {broadcast === 'on' ? (
        <span className="chip live">Broadcasting this tab</span>
      ) : (
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!spotify.playerReady || broadcast === 'starting'}
            onClick={onStartBroadcast}
          >
            {broadcast === 'lost' ? 'Resume broadcast' : 'Start broadcast'}
          </button>
          <p className="muted">
            Chrome will ask what to share: pick <b>this tab</b> and keep “Also share tab audio” on.
          </p>
          {!spotify.playerReady && <p className="muted">Connecting the Spotify player…</p>}
        </>
      )}
      <button type="button" className="btn small" onClick={spotify.logout}>
        Log out of Spotify
      </button>
    </div>
  );
}
