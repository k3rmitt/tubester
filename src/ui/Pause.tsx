import { useEffect, useRef } from 'react';
import type { LobbyPlayer } from '../host/lobby';
import type { GuestIntent } from '../host/runtime';
import type { GameView } from '../host/view';

type Act = (intent: GuestIntent) => void;

/** Anyone can pause while a game is running. */
export function PauseButton({ view, act }: { view: GameView; act: Act }) {
  if (view.phase === 'finished' || view.paused) return null;
  return (
    <button type="button" className="btn small pause-btn" onClick={() => act({ type: 'pause' })}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
        <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
      </svg>
      Pause
    </button>
  );
}

/** Full-screen cover while paused; anyone can resume. */
export function PauseCover({ view, players, act }: { view: GameView; players: LobbyPlayer[]; act: Act }) {
  const resume = useRef<HTMLButtonElement>(null);
  const paused = view.paused !== null;
  useEffect(() => {
    if (paused) resume.current?.focus();
  }, [paused]);
  if (!view.paused) return null;
  const by = view.paused.by;
  const name = players.find((p) => p.id === by)?.name ?? 'someone';
  return (
    <div className="pause-cover" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <h2 id="pause-title">Paused by {name}</h2>
      <p className="muted">The music and the clock are on hold.</p>
      <button ref={resume} type="button" className="btn primary pause-resume" onClick={() => act({ type: 'resume' })}>
        Resume
      </button>
    </div>
  );
}
