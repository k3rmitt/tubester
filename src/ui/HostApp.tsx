import { useEffect, useRef, useState } from 'react';
import { HostSession, type HostSnapshot } from '../host/session';
import { FakeMusicSource } from '../music/fake';
import { createToneFeed, type ToneFeed } from '../music/tone';
import { createHostTransport } from '../net/peer';
import { newRoomCode } from '../net/room';
import { browserTimer } from '../util/timer';
import { Wordmark } from './components';
import { HostBoard } from './HostBoard';
import { HostLobby } from './HostLobby';
import { HOST_ID_KEY, NAME_KEY, ROOM_KEY } from './keys';

function hostId(): string {
  let id = localStorage.getItem(HOST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(HOST_ID_KEY, id);
  }
  return id;
}

export function HostApp() {
  const [code] = useState(() => {
    const c = localStorage.getItem(ROOM_KEY) ?? newRoomCode();
    localStorage.setItem(ROOM_KEY, c);
    return c;
  });
  const [snap, setSnap] = useState<HostSnapshot | null>(null);
  const [status, setStatus] = useState<'opening' | 'ready' | 'error'>('opening');
  const [soundBlocked, setSoundBlocked] = useState(false);
  const sessionRef = useRef<HostSession | null>(null);
  const feedRef = useRef<ToneFeed | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: () => void = () => undefined;
    const feed = createToneFeed();
    feedRef.current = feed;
    setSoundBlocked(feed.context.state === 'suspended');
    createHostTransport(code).then(
      (transport) => {
        if (cancelled) {
          transport.close();
          return;
        }
        transport.setAudioTrack(feed.track);
        const session = new HostSession({
          transport,
          music: new FakeMusicSource(feed.output),
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
      feed.close();
    };
  }, [code]);

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
  return (
    <main className="screen wide">
      {soundBlocked && (
        <button type="button" className="banner" onClick={enableSound}>
          Enable sound
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
      {status === 'ready' && session && snap && !snap.view && (
        <HostLobby code={code} snap={snap} session={session} onClose={closeRoom} />
      )}
    </main>
  );
}
