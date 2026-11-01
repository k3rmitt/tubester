import { type FormEvent, useEffect, useRef, useState } from 'react';
import { GuestSession, type GuestSnapshot, loadIdentity } from '../guest/session';
import type { GuestIntent } from '../host/runtime';
import { teamNameOf } from '../host/lobby';
import { createGuestTransport } from '../net/peer';
import { Disc, Scores, TokenChip, Wordmark } from './components';
import { NAME_KEY } from './keys';
import { PlayPanel } from './PlayPanel';
import { teamById } from './text';

export function GuestApp({ code }: { code: string }) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [snap, setSnap] = useState<GuestSnapshot | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const sessionRef = useRef<GuestSession | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => sessionRef.current?.dispose(), []);

  const stream = snap?.stream ?? null;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !stream || audio.srcObject === stream) return;
    audio.srcObject = stream;
    audio.play().then(
      () => setNeedsTap(false),
      () => setNeedsTap(true),
    );
  }, [stream]);

  function join(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || sessionRef.current) return;
    localStorage.setItem(NAME_KEY, n);
    // Unlock audio playback and keep the screen on while we still have the user's tap.
    audioRef.current?.play().catch(() => undefined);
    navigator.wakeLock?.request('screen').catch(() => undefined);
    sessionRef.current = new GuestSession({
      transport: createGuestTransport(code),
      identity: loadIdentity(localStorage),
      name: n,
      onUpdate: setSnap,
    });
  }

  function enableSound() {
    audioRef.current?.play().then(
      () => setNeedsTap(false),
      () => undefined,
    );
  }

  const act = (intent: GuestIntent) => sessionRef.current?.act(intent);

  return (
    <main className="screen">
      <audio ref={audioRef} autoPlay playsInline>
        <track kind="captions" />
      </audio>
      {needsTap && (
        <button type="button" className="banner" onClick={enableSound}>
          Tap to enable sound
        </button>
      )}
      {!snap && <JoinForm code={code} name={name} setName={setName} onJoin={join} />}
      {snap && !snap.view && <GuestLobby snap={snap} />}
      {snap?.view && <GuestGame snap={snap} act={act} />}
    </main>
  );
}

function JoinForm({
  code,
  name,
  setName,
  onJoin,
}: {
  code: string;
  name: string;
  setName: (n: string) => void;
  onJoin: (e: FormEvent) => void;
}) {
  return (
    <form className="rows" onSubmit={onJoin}>
      <div className="hero">
        <Disc size={112} />
        <Wordmark big />
        <p className="muted">Hear the song. Guess when it came out. Build your timeline first.</p>
      </div>
      <div className="panel">
        <span className="muted">Joining room</span>
        <strong className="headline">{code}</strong>
      </div>
      <label className="field">
        Your name
        <input
          className="input"
          value={name}
          maxLength={24}
          required
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="muted">Turn your sound on. Music plays on your phone, no account needed.</p>
      <button type="submit" className="btn primary">
        Join game
      </button>
    </form>
  );
}

function GuestLobby({ snap }: { snap: GuestSnapshot }) {
  return (
    <section className="rows">
      <header className="topbar">
        <Wordmark />
      </header>
      <p className="headline">{snap.status === 'open' && snap.lobby ? "You're in!" : 'Connecting…'}</p>
      {snap.error && (
        <p className="error" role="alert">
          {snap.error}
        </p>
      )}
      {snap.lobby && (
        <div className="panel rows">
          {snap.lobby.players.map((p) => (
            <div key={p.id} className="row">
              <span>
                <span className={p.connected ? 'dot' : 'dot off'} />
                {p.name}
                {p.isHost ? ' · host' : ''}
                {p.id === snap.playerId ? ' (you)' : ''}
              </span>
              <span className="muted">{teamNameOf(p.teamId)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="muted">Waiting for the host to start…</p>
    </section>
  );
}

function GuestGame({ snap, act }: { snap: GuestSnapshot; act: (i: GuestIntent) => void }) {
  const view = snap.view;
  if (!view) return null;
  const me = teamById(view, view.viewerTeamId);
  return (
    <>
      <header className="topbar">
        <Wordmark />
        {me && <TokenChip count={me.tokens} />}
      </header>
      {snap.status !== 'open' && (
        <p className="error" role="status">
          Reconnecting…
        </p>
      )}
      <Scores view={view} />
      <PlayPanel view={view} audio={snap.audio} stealWindowMs={snap.stealWindowMs} error={snap.error} act={act} />
    </>
  );
}
