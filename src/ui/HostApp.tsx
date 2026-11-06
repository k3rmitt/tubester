import { useEffect, useMemo, useRef, useState } from 'react';
import { captureTabAudio, type TabAudio } from '../host/broadcast';
import { gameTracks } from '../host/review';
import { HostSession, type HostSnapshot } from '../host/session';
import { DEMO_TRACKS } from '../music/demo';
import { FakeMusicSource } from '../music/fake';
import { MusicRouter } from '../music/router';
import type { ConnectDevice } from '../music/spotify/connect';
import { createToneFeed, type ToneFeed } from '../music/tone';
import { createHostTransport } from '../net/peer';
import { newRoomCode } from '../net/room';
import type { HostTransport } from '../net/transport';
import { browserTimer } from '../util/timer';
import { Wordmark } from './components';
import { HostBoard } from './HostBoard';
import { HostLobby } from './HostLobby';
import { HOST_ID_KEY, NAME_KEY, ROOM_KEY } from './keys';
import { type BroadcastState, type MusicMode, MusicPanel } from './MusicPanel';
import {
  audioTrackFor,
  browserEnv,
  canStream,
  DEVICE_KEY,
  defaultWhere,
  demoAllowed,
  demoFlag,
  effectiveSource,
  initialDevice,
  isLocalDevice,
  shouldAutoPause,
  WHERE_KEY,
  type Where,
} from './musicMode';
import { useSpotify } from './useSpotify';
import { YearReview } from './YearReview';

const MODE_KEY = 'tubester.music';

function readDevice(): ConnectDevice | null {
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null') as Partial<ConnectDevice> | null;
    return d && typeof d.id === 'string' && typeof d.name === 'string' ? { id: d.id, name: d.name } : null;
  } catch {
    return null;
  }
}

function hostId(): string {
  let id = localStorage.getItem(HOST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(HOST_ID_KEY, id);
  }
  return id;
}

export function HostApp() {
  const env = useMemo(browserEnv, []);
  const streamable = canStream(env);
  const [where, setWhereState] = useState<Where>(() => defaultWhere(env, localStorage.getItem(WHERE_KEY)));
  const [device, setDeviceState] = useState<ConnectDevice | null>(() => initialDevice(readDevice(), streamable));
  // The in-tab player streams to the phones, or plays out loud when the room device is This computer.
  const playsHere = where === 'stream' || isLocalDevice(device);
  const spotify = useSpotify({ wantPlayer: playsHere, device });
  const demoOpts = { flag: demoFlag(), spotifyAvailable: spotify.available };
  const [code] = useState(() => {
    const c = localStorage.getItem(ROOM_KEY) ?? newRoomCode();
    localStorage.setItem(ROOM_KEY, c);
    return c;
  });
  const [mode, setModeState] = useState<MusicMode>(() => effectiveSource(localStorage.getItem(MODE_KEY), demoOpts));
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [status, setStatus] = useState<'opening' | 'ready' | 'error'>('opening');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [broadcast, setBroadcast] = useState<BroadcastState>('off');
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const sessionRef = useRef<HostSession | null>(null);
  const feedRef = useRef<ToneFeed | null>(null);
  const demoRef = useRef<FakeMusicSource | null>(null);
  const routerRef = useRef<MusicRouter | null>(null);
  const transportRef = useRef<HostTransport | null>(null);
  const captureRef = useRef<TabAudio | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => undefined;
    const feed = createToneFeed();
    const demo = new FakeMusicSource(feed.output);
    const router = new MusicRouter(demo);
    feedRef.current = feed;
    demoRef.current = demo;
    routerRef.current = router;
    setSoundBlocked(feed.context.state === 'suspended');
    createHostTransport(code).then(
      (transport) => {
        if (cancelled) {
          transport.close();
          return;
        }
        transportRef.current = transport;
        const session = new HostSession({
          transport,
          music: router,
          host: { id: hostId(), name: localStorage.getItem(NAME_KEY) || 'Host' },
          setTimer: browserTimer,
          storage: localStorage,
          onUpdate: setSnap,
        });
        sessionRef.current = session;
        setSnap(session.snapshot());
        setStatus('ready');
        cleanup = () => {
          session.dispose();
          transport.close();
        };
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
      cleanup();
      captureRef.current?.stop();
      feed.close();
    };
  }, [code]);

  // Route music and the broadcast track to the chosen source.
  useEffect(() => {
    const router = routerRef.current;
    const transport = transportRef.current;
    const feed = feedRef.current;
    const demo = demoRef.current;
    if (status !== 'ready' || !router || !transport || !feed || !demo) return;
    if (mode === 'demo') router.use(demo);
    else if (where === 'room') {
      const room = isLocalDevice(device) ? spotify.source : spotify.connectSource;
      if (room) router.use(room);
    } else if (spotify.source) router.use(spotify.source);
    transport.setAudioTrack(audioTrackFor(where, mode, { feed: feed.track, capture: captureRef.current?.track ?? null }));
  }, [status, mode, where, device, spotify.source, spotify.connectSource]);

  // Guests learn whether the music is in the room (ignored once a game runs).
  useEffect(() => {
    if (status === 'ready') sessionRef.current?.setMusicInRoom(where === 'room');
  }, [status, where]);

  const inGame = !!snap?.view && snap.view.phase !== 'finished';

  // Keep the host's screen on during a game: a locked screen pauses the tab.
  useEffect(() => {
    if (!inGame) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock?.request('screen').then(
        (l) => {
          if (done) void l.release();
          else lock = l;
        },
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, [inGame]);

  // In the room, the game pauses itself when the host's tab goes to the background.
  const latest = useRef({ where, snap });
  latest.current = { where, snap };
  useEffect(() => {
    const onVisibility = () => {
      const view = latest.current.snap?.view ?? null;
      const pause = shouldAutoPause({
        hidden: document.visibilityState === 'hidden',
        inRoom: latest.current.where === 'room',
        phase: view?.phase ?? null,
        paused: !!view?.paused,
      });
      if (pause) sessionRef.current?.act({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function setWhere(next: Where) {
    localStorage.setItem(WHERE_KEY, next);
    setWhereState(next);
  }

  function setDevice(next: ConnectDevice | null) {
    if (next) localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    else localStorage.removeItem(DEVICE_KEY);
    setDeviceState(next);
  }

  /** The in-tab player may only start audio from a tap: call this from click handlers. */
  function unlockLocalPlayer() {
    if (mode === 'spotify' && where === 'room' && isLocalDevice(device)) void spotify.source?.activate();
  }

  function retryMusic() {
    unlockLocalPlayer();
    if (where === 'room' && mode === 'spotify' && !isLocalDevice(device)) spotify.refreshDevices();
    sessionRef.current?.retryMusic();
  }

  function setMode(next: MusicMode) {
    localStorage.setItem(MODE_KEY, next);
    setModeState(next);
  }

  async function startBroadcast() {
    setBroadcast('starting');
    setBroadcastError(null);
    try {
      await spotify.source?.activate();
      captureRef.current?.stop();
      const capture = await captureTabAudio();
      // The host switched to "In the room" while the share dialog was open: guests get no sound in that mode.
      if (latest.current.where !== 'stream') {
        capture.stop();
        setBroadcast(captureRef.current ? 'on' : 'off');
        return;
      }
      captureRef.current = capture;
      capture.onEnded(() => {
        if (captureRef.current !== capture) return;
        captureRef.current = null;
        transportRef.current?.setAudioTrack(null);
        setBroadcast('lost');
      });
      transportRef.current?.setAudioTrack(capture.track);
      setBroadcast('on');
    } catch (e) {
      setBroadcast(captureRef.current ? 'on' : 'off');
      setBroadcastError(e instanceof Error ? e.message : String(e));
    }
  }

  function closeRoom() {
    sessionRef.current?.reset();
    localStorage.removeItem(ROOM_KEY);
    window.location.hash = '#/';
    window.location.reload();
  }

  function enableSound() {
    feedRef.current?.context.resume().then(
      () => setSoundBlocked(false),
      () => undefined,
    );
  }

  const session = sessionRef.current;
  const tracks = mode === 'demo' ? DEMO_TRACKS : gameTracks(spotify.rows);
  const musicReady =
    mode === 'demo' ||
    (tracks.length > 0 &&
      (where === 'stream'
        ? broadcast === 'on' && spotify.playerReady
        : spotify.loggedIn && device !== null && (!isLocalDevice(device) || spotify.playerReady)));
  const needsBroadcast = mode === 'spotify' && where === 'stream' && broadcast !== 'on' && !!snap?.view;

  return (
    <main className="screen wide">
      {soundBlocked && mode === 'demo' && (
        <button type="button" className="banner" onClick={enableSound}>
          Enable sound
        </button>
      )}
      {mode === 'spotify' && spotify.available && !spotify.loggedIn && !!snap?.view && (
        <button type="button" className="banner" onClick={spotify.login}>
          Spotify session ended · Log in to Spotify again
        </button>
      )}
      {needsBroadcast && (
        <button type="button" className="banner" onClick={() => void startBroadcast()}>
          Broadcast stopped · Resume broadcast
        </button>
      )}
      {status === 'opening' && (
        <>
          <Wordmark />
          <p className="muted">Opening room {code}…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <Wordmark />
          <p className="error" role="alert">
            Couldn't open the room. Check your connection and reload.
          </p>
        </>
      )}
      {status === 'ready' && session && snap?.view && <HostBoard
          code={code}
          snap={snap}
          session={session}
          onRetryMusic={retryMusic}
          phoneNotice={where === 'room' && !streamable}
        />}
      {status === 'ready' && session && snap && !snap.view && reviewing && (
        <YearReview rows={spotify.rows} onChange={spotify.setRows} onDone={() => setReviewing(false)} />
      )}
      {status === 'ready' && session && snap && !snap.view && !reviewing && (
        <HostLobby
          code={code}
          snap={snap}
          session={session}
          onClose={closeRoom}
          onStart={unlockLocalPlayer}
          musicReady={musicReady}
          tracks={tracks}
          music={
            <MusicPanel
              where={where}
              setWhere={setWhere}
              streamable={streamable}
              showDemo={demoAllowed(demoOpts)}
              device={device}
              setDevice={setDevice}
              mode={mode}
              setMode={setMode}
              spotify={spotify}
              broadcast={broadcast}
              broadcastError={broadcastError}
              onStartBroadcast={() => void startBroadcast()}
              onReview={() => setReviewing(true)}
            />
          }
        />
      )}
    </main>
  );
}
