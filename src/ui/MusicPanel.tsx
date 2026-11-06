import { useEffect, useState } from 'react';
import { reviewSummary } from '../host/review';
import { DEMO_TRACKS } from '../music/demo';
import { NEEDS_RELOGIN } from '../music/spotify/api';
import type { ConnectDevice } from '../music/spotify/connect';
import { isLocalDevice, LOCAL_DEVICE, type Where } from './musicMode';
import type { SpotifyState } from './useSpotify';

export type MusicMode = 'demo' | 'spotify';
export type BroadcastState = 'off' | 'starting' | 'on' | 'lost';

export function MusicPanel({
  where,
  setWhere,
  streamable,
  showDemo,
  mode,
  setMode,
  spotify,
  device,
  setDevice,
  broadcast,
  broadcastError,
  onStartBroadcast,
  onReview,
}: {
  where: Where;
  setWhere: (w: Where) => void;
  /** False on phones, tablets and browsers that can't share a tab with its sound. */
  streamable: boolean;
  showDemo: boolean;
  mode: MusicMode;
  setMode: (m: MusicMode) => void;
  spotify: SpotifyState;
  device: ConnectDevice | null;
  setDevice: (d: ConnectDevice | null) => void;
  broadcast: BroadcastState;
  broadcastError: string | null;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  return (
    <section className="panel">
      <h2>Music</h2>
      <fieldset className="choices stacked">
        <legend className="muted">Where will people hear the music?</legend>
        <label className="choice">
          <input type="radio" name="where" checked={where === 'room'} onChange={() => setWhere('room')} />
          <span>
            In the room
            <span className="choice-note">One device plays the music out loud. Everyone must be in the same room.</span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name="where" checked={where === 'stream'} onChange={() => setWhere('stream')} />
          <span>
            On everyone's phone
            <span className={streamable ? 'choice-note' : 'choice-note warn'}>
              The music plays here and is streamed to each phone. Needs Chrome or Edge on a computer.
            </span>
          </span>
        </label>
      </fieldset>
      {showDemo && (
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
      )}
      {mode === 'demo' && <p className="muted">Demo hits · {DEMO_TRACKS.length} songs, played as test tones.</p>}
      {mode === 'spotify' && (
        <SpotifySteps
          where={where}
          canPlayHere={streamable}
          spotify={spotify}
          device={device}
          setDevice={setDevice}
          broadcast={broadcast}
          onStartBroadcast={onStartBroadcast}
          onReview={onReview}
        />
      )}
      {spotify.error && (
        <p className="error" role="alert">
          {spotify.error}
        </p>
      )}
      {spotify.loggedIn && spotify.error === NEEDS_RELOGIN && (
        <button type="button" className="btn small" onClick={spotify.login}>
          Log in with Spotify
        </button>
      )}
      {broadcastError && where === 'stream' && (
        <p className="error" role="alert">
          {broadcastError}
        </p>
      )}
    </section>
  );
}

function SpotifySteps({
  where,
  canPlayHere,
  spotify,
  device,
  setDevice,
  broadcast,
  onStartBroadcast,
  onReview,
}: {
  where: Where;
  canPlayHere: boolean;
  spotify: SpotifyState;
  device: ConnectDevice | null;
  setDevice: (d: ConnectDevice | null) => void;
  broadcast: BroadcastState;
  onStartBroadcast: () => void;
  onReview: () => void;
}) {
  const [picked, setPicked] = useState('');
  if (!spotify.loggedIn) {
    return (
      <>
        <p className="muted">Spotify Premium is needed for the host only. Guests just need the link.</p>
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
      {where === 'room' ? (
        <DevicePicker spotify={spotify} canPlayHere={canPlayHere} device={device} setDevice={setDevice} />
      ) : (
        <Broadcast spotify={spotify} broadcast={broadcast} onStartBroadcast={onStartBroadcast} />
      )}
      <button type="button" className="btn small" onClick={spotify.logout}>
        Log out of Spotify
      </button>
    </div>
  );
}

const DEVICE_HELP = "Don't see your device? Open the Spotify app on it, play anything for a second, then tap Refresh.";

function DevicePicker({
  spotify,
  canPlayHere,
  device,
  setDevice,
}: {
  spotify: SpotifyState;
  /** Desktop: the in-tab player can play out loud here, no device to find. */
  canPlayHere: boolean;
  device: ConnectDevice | null;
  setDevice: (d: ConnectDevice | null) => void;
}) {
  const { refreshDevices } = spotify;
  const local = isLocalDevice(device);
  useEffect(() => {
    if (!local) refreshDevices();
  }, [refreshDevices, local]);
  // Our own tab shows up as a Connect device too ("TUBESTER"): This computer already covers it.
  const tabId = spotify.source?.deviceIdNow ?? null;
  const devices = spotify.devices?.filter((d) => d.id !== tabId && d.name !== 'TUBESTER') ?? null;
  const listed = local || (devices?.some((d) => d.id === device?.id) ?? false);
  return (
    <>
      <div className="device-row">
        <label className="field">
          Play on
          <select
            className="input"
            value={device?.id ?? ''}
            onChange={(e) => {
              if (e.target.value === LOCAL_DEVICE.id) {
                setDevice({ ...LOCAL_DEVICE });
                void spotify.source?.activate();
                return;
              }
              const d = devices?.find((x) => x.id === e.target.value);
              setDevice(d ? { id: d.id, name: d.name } : null);
            }}
          >
            <option value="">{devices || local ? 'Pick a Spotify device' : 'Looking for devices…'}</option>
            {canPlayHere && <option value={LOCAL_DEVICE.id}>This computer</option>}
            {device && !listed && <option value={device.id}>{device.name} (not seen right now)</option>}
            {devices?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.type ? ` · ${d.type}` : ''}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" onClick={refreshDevices}>
          Refresh
        </button>
      </div>
      {local ? (
        <p className="muted">
          The music plays from this computer's speakers. Keep this tab open.
          {!spotify.playerReady && ' Connecting the Spotify player…'}
        </p>
      ) : (
        <p className={devices && devices.length === 0 ? '' : 'muted'}>{DEVICE_HELP}</p>
      )}
      <p className="muted warn-note">
        The song name shows on the device that plays. Keep it out of sight, or pick a playlist you don't know well.
      </p>
    </>
  );
}

function Broadcast({
  spotify,
  broadcast,
  onStartBroadcast,
}: {
  spotify: SpotifyState;
  broadcast: BroadcastState;
  onStartBroadcast: () => void;
}) {
  if (broadcast === 'on') return <span className="chip live">Broadcasting this tab</span>;
  return (
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
  );
}
