import { useState } from 'react';
import { teamNameOf } from '../host/lobby';
import type { GuestIntent } from '../host/runtime';
import type { HostSession, HostSnapshot } from '../host/session';
import { TeamIcon, TeamTag, Timeline, Wordmark } from './components';
import { PauseButton, PauseCover } from './Pause';
import { PlayPanel } from './PlayPanel';
import { teamById } from './text';

export function HostBoard({
  code,
  snap,
  session,
}: {
  code: string;
  snap: HostSnapshot;
  session: HostSession;
}) {
  const [error, setError] = useState<string | null>(null);
  const view = snap.view;
  if (!view) return null;
  const players = snap.lobby.players;
  const online = players.filter((p) => !p.isHost && p.connected).length;
  const act = (intent: GuestIntent) => {
    const r = session.act(intent);
    setError(r.ok ? null : r.reason);
  };

  return (
    <>
      <header className="topbar">
        <span>
          <Wordmark /> <span className="muted">Room {code} · {view.deckRemaining} songs left</span>
        </span>
        <span className="actions">
          <span className="chip live">
            Broadcasting to {online} {online === 1 ? 'player' : 'players'}
          </span>
          <PauseButton view={view} act={act} />
          {view.phase === 'deciding' && (
            <button type="button" className="btn small" onClick={() => session.command({ type: 'passTurn' })}>
              Pass turn
            </button>
          )}
          {view.phase === 'reveal' && (
            <button type="button" className="btn small" onClick={() => session.command({ type: 'nextTurn' })}>
              Next
            </button>
          )}
          {view.phase === 'finished' && (
            <button type="button" className="btn small" onClick={() => session.reset()}>
              New game
            </button>
          )}
        </span>
      </header>
      {snap.musicError && (
        <div className="panel" role="alert">
          <p className="error">Music stopped: {snap.musicError}</p>
          <button type="button" className="btn small" onClick={() => session.retryMusic()}>
            Try again
          </button>
        </div>
      )}
      <div className="board">
        <div className="main">
          {view.turnOrder.map((id) => {
            const team = teamById(view, id);
            if (!team) return null;
            const members = players.filter((p) => p.teamId === id).map((p) => p.name);
            return (
              <section key={id} className={view.turn?.teamId === id ? 'panel active' : 'panel'}>
                <div className="row">
                  <TeamTag teamId={id} name={team.name} me={view.turn?.teamId === id} />
                  <span className="muted">
                    {members.join(', ')} · {team.timeline.length}/{view.settings.cardsToWin} · {team.tokens} tokens
                  </span>
                </div>
                <Timeline cards={team.timeline} horizontal />
              </section>
            );
          })}
        </div>
        <div className="side">
          <PlayPanel
            view={view}
            audio={snap.audio}
            stealWindowMs={snap.lobby.settings.stealWindowSec * 1000}
            error={error}
            act={act}
          />
          <section className="panel rows">
            <h2>Players</h2>
            {players.map((p) => (
              <div key={p.id} className="row">
                <span>
                  <span className={p.connected ? 'dot' : 'dot off'} />
                  {p.name}
                  {p.isHost ? ' · host' : p.connected ? '' : ' · reconnecting…'}
                </span>
                <span className="muted team-name">
                  <TeamIcon teamId={p.teamId} /> {teamNameOf(p.teamId)}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
      <PauseCover view={view} players={players} act={act} onEndGame={() => session.endGame()} />
    </>
  );
}
