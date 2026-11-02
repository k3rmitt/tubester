import { type ReactNode, useState } from 'react';
import type { CardView, GameView } from '../host/view';
import type { AudioState } from '../net/protocol';
import { slotLabel, teamById } from './text';

export function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <span className={big ? 'wordmark big' : 'wordmark'}>
      TUBE<span>STER</span>
    </span>
  );
}

export function TokenChip({ count }: { count: number }) {
  return (
    <span className="chip" role="img" aria-label={`${count} tokens`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
      <strong>{count}</strong>
    </span>
  );
}

export function Scores({ view }: { view: GameView }) {
  return (
    <div className="scores">
      {view.turnOrder.map((id) => {
        const team = teamById(view, id);
        if (!team) return null;
        return (
          <span key={id} className={id === view.viewerTeamId ? 'chip me' : 'chip'}>
            {team.name} {team.timeline.length}/{view.settings.cardsToWin}
          </span>
        );
      })}
    </div>
  );
}

export function Disc({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0B0C10" stroke="#2A2F3A" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#1E222B" strokeWidth="2" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#1E222B" strokeWidth="2" />
      <circle cx="32" cy="32" r="9" fill="#FFD23F" />
      <circle cx="32" cy="32" r="2" fill="#0B0C10" />
    </svg>
  );
}

/** Album cover, or a plain record sleeve when there is none or it fails to load. */
export function Cover({ url, size, label }: { url?: string; size: number; label: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!url || failed) {
    return (
      <span className="cover placeholder" style={style} role="img" aria-label={label}>
        <Disc size={Math.round(size * 0.6)} />
      </span>
    );
  }
  return (
    <img
      className="cover"
      style={style}
      src={url}
      alt={label}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** Stands in for the cover of the song being played: it stays secret until the reveal. */
export function MysterySleeve({ size = 64 }: { size?: number }) {
  return (
    <span className="cover mystery" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">
      ?
    </span>
  );
}

export function NowPlaying({ label, audio }: { label: string; audio: AudioState }) {
  return (
    <div className="panel now">
      <MysterySleeve />
      <div className="rows">
        <span className="kicker">{label}</span>
        <strong className="headline">Mystery track</strong>
        {audio === 'playing' ? (
          <span className="eq" role="img" aria-label="Playing">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="muted">{audio === 'countdown' ? 'Get ready…' : 'Stopped'}</span>
        )}
      </div>
    </div>
  );
}

export type SlotState = 'free' | 'mine' | 'theirs' | 'taken';

export interface SlotProps {
  state: SlotState;
  note?: string;
  onPick?: () => void;
}

/** Oldest first. With `slots`, renders a gap button before, between and after the cards. */
export function Timeline({
  cards,
  slots,
  horizontal = false,
}: {
  cards: CardView[];
  slots?: SlotProps[];
  horizontal?: boolean;
}) {
  const items: ReactNode[] = [];
  for (let i = 0; i <= cards.length; i++) {
    const slot = slots?.[i];
    if (slot) {
      items.push(
        <button
          key={`slot-${i}`}
          type="button"
          className={slot.onPick ? `slot ${slot.state} can-pick` : `slot ${slot.state}`}
          disabled={!slot.onPick}
          aria-pressed={slot.state === 'mine'}
          onClick={slot.onPick}
        >
          {slot.onPick && (
            <span className="slot-plus" aria-hidden="true">
              +
            </span>
          )}
          {slotLabel(cards, i)}
          {slot.note ? ` · ${slot.note}` : ''}
        </button>,
      );
    }
    const card = cards[i];
    if (card) {
      items.push(
        <div key={card.trackId} className="card">
          <Cover url={card.cover} size={44} label={`${card.title} cover`} />
          <span className="year">{card.year}</span>
          <span className="meta">
            <span className="title">{card.title}</span>
            <span className="artist">{card.artists.join(', ')}</span>
          </span>
        </div>,
      );
    }
  }
  return <div className={horizontal ? 'timeline horizontal' : 'timeline'}>{items}</div>;
}
