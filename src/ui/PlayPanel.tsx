import { useEffect, useState } from 'react';
import type { GuestIntent } from '../host/runtime';
import type { GameView } from '../host/view';
import type { AudioState } from '../net/protocol';
import { EndCard } from './EndCard';
import { Cover, NowPlaying, Scores, type SlotProps, Timeline } from './components';
import { revealHeadline, teamById, winnersHeadline } from './text';

export interface PlayPanelProps {
  view: GameView;
  audio: AudioState;
  stealWindowMs: number;
  error: string | null;
  act: (intent: GuestIntent) => void;
}

/** Counts down from `leftMs` (the host's latest figure); restarts when it changes and holds while not running. */
export function useCountdown(leftMs: number, running: boolean): number {
  const [left, setLeft] = useState(leftMs);
  useEffect(() => {
    setLeft(leftMs);
    if (!running) return;
    const end = Date.now() + leftMs;
    const id = setInterval(() => setLeft(Math.max(0, end - Date.now())), 200);
    return () => clearInterval(id);
  }, [leftMs, running]);
  return left;
}

/** Everything a player can see and do during a game; shared by guest phones and the host board. */
export function PlayPanel(props: PlayPanelProps) {
  const { view } = props;
  if (view.phase === 'finished') return <Finished view={view} />;
  if (view.phase === 'reveal') return <Reveal view={view} />;
  const turn = view.turn;
  if (!turn) return null;
  const mine = turn.teamId === view.viewerTeamId;
  if (mine && view.phase === 'deciding') return <MyTurn key={turn.seq} {...props} />;
  if (!mine && view.phase === 'stealWindow') return <Steal key={turn.seq} {...props} />;
  return <Watching {...props} />;
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

function MyTurn({ view, audio, error, act }: PlayPanelProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const team = teamById(view, view.viewerTeamId);
  const turn = view.turn;
  if (!team || !turn) return null;
  const slots: SlotProps[] = Array.from({ length: team.timeline.length + 1 }, (_, i) => ({
    state: i === turn.slot ? 'mine' : 'free',
    note: i === turn.slot ? 'your guess' : undefined,
    onPick: () => act({ type: 'place', slot: i }),
  }));
  const guess = title.trim() || artist.trim() ? { title, artist } : undefined;
  return (
    <section className="rows">
      <NowPlaying label={`Your turn · ${team.name}`} audio={audio} />
      <h2>Place it on your timeline</h2>
      <span className="muted">Tap a yellow spot to place the song</span>
      <Timeline cards={team.timeline} slots={slots} />
      <span className="muted">Name it for +1 token (optional)</span>
      <div className="grid2">
        <label className="field">
          Title
          <input
            className="input"
            value={title}
            maxLength={200}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          Artist
          <input
            className="input"
            value={artist}
            maxLength={200}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setArtist(e.target.value)}
          />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="actions sticky-bottom">
        <div className="actions">
          <button type="button" className="btn" disabled={team.tokens < 1} onClick={() => act({ type: 'skip' })}>
            Skip · 1 token
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={turn.slot === null}
            onClick={() => act({ type: 'lockIn', guess })}
          >
            Lock in
          </button>
        </div>
      </div>
    </section>
  );
}

function Steal({ view, stealWindowMs, error, act }: PlayPanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const left = useCountdown(view.timerLeftMs ?? stealWindowMs, view.paused === null);
  const turn = view.turn;
  const active = teamById(view, turn?.teamId);
  const me = teamById(view, view.viewerTeamId);
  if (!turn || !active || !me) return null;
  const myClaim = turn.steals.find((s) => s.teamId === me.id);
  const slots: SlotProps[] = Array.from({ length: active.timeline.length + 1 }, (_, i): SlotProps => {
    if (i === turn.slot) return { state: 'theirs', note: `${active.name}'s pick` };
    const claim = turn.steals.find((s) => s.slot === i);
    if (claim) {
      return claim.teamId === me.id
        ? { state: 'mine', note: 'your steal' }
        : { state: 'taken', note: teamById(view, claim.teamId)?.name };
    }
    if (myClaim || left === 0) return { state: 'free' };
    return { state: i === picked ? 'mine' : 'free', onPick: () => setPicked(i) };
  });
  const canPress = picked !== null && !myClaim && me.tokens >= 1 && left > 0;
  const seconds = Math.ceil(left / 1000);
  return (
    <section className="rows stealing">
      <div className="panel now">
        <span className="countdown" role="timer" aria-label={`${seconds} seconds left`}>
          {seconds}
        </span>
        <div className="rows">
          <span className="kicker steal">Steal window</span>
          <span>{active.name} locked in. Think they're wrong?</span>
        </div>
      </div>
      <h2>{active.name}'s timeline</h2>
      <Timeline cards={active.timeline} slots={slots} />
      <ErrorLine error={error} />
      <div className="sticky-bottom">
        <span className="muted">
          {myClaim ? 'Steal placed. Fingers crossed!' : 'Pick a slot, then press. Costs 1 token.'}
        </span>
        <button
          type="button"
          className="btn tubester"
          disabled={!canPress}
          onClick={() => {
            if (picked !== null) act({ type: 'steal', slots: [picked] });
          }}
        >
          TUBESTER!
        </button>
      </div>
      <BuyButton view={view} act={act} />
    </section>
  );
}

function Watching({ view, audio, act }: PlayPanelProps) {
  const turn = view.turn;
  const active = teamById(view, turn?.teamId);
  if (!turn || !active) return null;
  const slots: SlotProps[] | undefined =
    turn.slot === null
      ? undefined
      : Array.from({ length: active.timeline.length + 1 }, (_, i) => ({ state: i === turn.slot ? 'theirs' : 'free' }));
  const label = view.phase === 'stealWindow' ? `${active.name} locked in` : `${active.name} is placing…`;
  return (
    <section className="rows">
      <NowPlaying label={label} audio={audio} />
      <h2>{active.name}'s timeline</h2>
      <Timeline cards={active.timeline} slots={slots} />
      <BuyButton view={view} act={act} />
    </section>
  );
}

function BuyButton({ view, act }: Pick<PlayPanelProps, 'view' | 'act'>) {
  const me = teamById(view, view.viewerTeamId);
  if (!me || view.turn?.teamId === me.id) return null;
  const cost = view.settings.buyCost;
  return (
    <button type="button" className="btn small" disabled={me.tokens < cost} onClick={() => act({ type: 'buy' })}>
      Buy a card · {cost} tokens
    </button>
  );
}

function Reveal({ view }: { view: GameView }) {
  const r = view.reveal;
  if (!r) return null;
  const active = teamById(view, r.outcome.activeTeamId);
  return (
    <section className="rows">
      <div className="reveal">
        <Cover url={r.cover} size={150} label={`${r.title} cover`} />
        <span className="kicker">It was</span>
        <span className="big-year">{r.year}</span>
        <span className="song">{r.title}</span>
        <span>{r.artists.join(', ')}</span>
      </div>
      <p className="headline">{revealHeadline(view)}</p>
      {r.outcome.nameBonus && <p className="muted">{active?.name ?? 'They'} named it: +1 token</p>}
    </section>
  );
}

function Finished({ view }: { view: GameView }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rows">
      {open && <EndCard view={view} onClose={() => setOpen(false)} />}
      <p className="headline big">{winnersHeadline(view)}</p>
      <Reveal view={view} />
      <Scores view={view} />
    </section>
  );
}
