import { useEffect, useRef, useState } from 'react';
import { captureTabAudio, type TabAudio } from '../host/broadcast';
import { gameTracks } from '../host/review';
import { HostSession, type HostSnapshot } from '../host/session';
import { DEMO_TRACKS } from '../music/demo';
import { FakeMusicSource } from '../music/fake';
import { MusicRouter } from '../music/router';
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
import { useSpotify } from './useSpotify';
import { YearReview } from './YearReview';

const MODE_KEY = 'tubester.music';

function hostId(): string {
  let id = localStorage.getItem(HOST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(HOST_ID_KEY, id);
  }
  return id;
}

export function HostApp() {
  const spotify = useSpotify();
  const [code] = useState(() => {
    const c = localStorage.getItem(ROOM_KEY) ?? newRoomCode();
    localStorage.setItem(ROOM_KEY, c);
    return c;
  });
  const [mode, setModeState] = useState<MusicMode>(() =>
    spotify.available && localStorage.getItem(MODE_KEY) === 'spotify' ? 'spotify' : 'demo',
  );
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
    if (mode === 'demo') {
      router.use(demo);
      transport.setAudioTrack(feed.track);
      return;
    }
    if (spotify.source) router.use(spotify.source);
    transport.setAudioTrack(captureRef.current?.track ?? null);
  }, [status, mode, spotify.source]);

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
  const musicReady = mode === 'demo' || (broadcast === 'on' && spotify.playerReady && tracks.length > 0);
  const needsBroadcast = mode === 'spotify' && broadcast !== 'on' && !!snap?.view;

  return (
    <main className="screen wide">
      {soundBlocked && mode === 'demo' && (
        <button type="button" className="banner" onClick={enableSound}>
          Enable sound
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
      {status === 'ready' && session && snap?.view && <HostBoard code={code} snap={snap} session={session} />}
      {status === 'ready' && session && snap && !snap.view && reviewing && (
        <YearReview rows={spotify.rows} onChange={spotify.setRows} onDone={() => setReviewing(false)} />
      )}
      {status === 'ready' && session && snap && !snap.view && !reviewing && (
        <HostLobby
          code={code}
          snap={snap}
          session={session}
          onClose={closeRoom}
          musicReady={musicReady}
          tracks={tracks}
          music={
            <MusicPanel
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
