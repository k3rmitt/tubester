import { type ReactNode, useState } from 'react';
import { canStart, MAX_PLAYERS, TEAMS } from '../host/lobby';
import type { GameTrack, HostSession, HostSnapshot } from '../host/session';
import { Wordmark } from './components';
import { joinUrl } from './router';

export function HostLobby({
  code,
  snap,
  session,
  onClose,
  music,
  musicReady,
  tracks,
}: {
  code: string;
  snap: HostSnapshot;
  session: HostSession;
  onClose: () => void;
  music: ReactNode;
  musicReady: boolean;
  tracks: GameTrack[];
}) {
  const [error, setError] = useState<string | null>(null);
  const { lobby } = snap;
  const link = joinUrl(code);
  const teamsReady = canStart(lobby);

  function start() {
    const r = session.startGame(tracks);
    setError(r.ok ? null : r.reason);
  }

  return (
    <>
      <header className="topbar">
        <span>
          <Wordmark /> <span className="muted">Room {code}</span>
        </span>
        <button type="button" className="btn small" onClick={onClose}>
          Close room
        </button>
      </header>
      <div className="board">
        <section className="main panel">
          <h2>
            Players ({lobby.players.length}/{MAX_PLAYERS})
          </h2>
          <div className="rows">
            {lobby.players.map((p) => (
              <div key={p.id} className="row">
                <span>
                  <span className={p.connected ? 'dot' : 'dot off'} />
                  {p.name}
                  {p.isHost ? ' · host' : ''}
                </span>
                <select
                  className="input"
                  aria-label={`Team for ${p.name}`}
                  value={p.teamId}
                  onChange={(e) => session.assignTeam(p.id, e.target.value)}
                >
                  {TEAMS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="muted">Everyone plays solo by default. Put players on the same team to share a timeline.</p>
        </section>
        <div className="side">
          <section className="panel">
            <h2>Invite</h2>
            <div className="link-box" data-testid="invite-link">
              {link}
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => navigator.clipboard?.writeText(link).catch(() => undefined)}
            >
              Copy link
            </button>
          </section>
          <section className="panel">
            <h2>Rules</h2>
            <NumberSetting
              label="Cards to win"
              value={lobby.settings.cardsToWin}
              onCommit={(v) => session.updateSettings({ cardsToWin: v })}
            />
            <NumberSetting
              label="Starting tokens"
              value={lobby.settings.startingTokens}
              onCommit={(v) => session.updateSettings({ startingTokens: v })}
            />
            <NumberSetting
              label="Steal window (s)"
              value={lobby.settings.stealWindowSec}
              onCommit={(v) => session.updateSettings({ stealWindowSec: v })}
            />
          </section>
          {music}
          <section className="panel">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn primary" disabled={!teamsReady || !musicReady} onClick={start}>
              Start game
            </button>
            {!teamsReady && <p className="muted">Need at least 2 teams.</p>}
            {teamsReady && !musicReady && <p className="muted">Finish the music setup first.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

/** Commits on blur so typing "12" doesn't clamp at "1". `key` resets the field after clamping. */
function NumberSetting({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="field inline">
      {label}
      <input
        key={value}
        className="input narrow"
        type="number"
        inputMode="numeric"
        defaultValue={value}
        onBlur={(e) => {
          onCommit(e.target.value === '' ? Number.NaN : Number(e.target.value));
          // If the value was rejected or clamped back to the same number, `key` won't remount: show it again.
          e.target.value = String(value);
        }}
      />
    </label>
  );
}
