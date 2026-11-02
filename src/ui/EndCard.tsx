import type { CSSProperties } from 'react';
import type { GameView } from '../host/view';
import { cardCount, endCardTone, teamById, winnersHeadline } from './text';

/** Fixed confetti layout (left %, delay s, rotation deg) so every screen gets the same sprinkle. */
const CONFETTI: [number, number, number][] = [
  [8, 0.5, 120],
  [17, 0.9, -200],
  [26, 0.6, 260],
  [34, 1.1, -90],
  [42, 0.7, 180],
  [50, 1.0, -240],
  [58, 0.55, 150],
  [66, 1.2, -160],
  [73, 0.8, 220],
  [81, 0.65, -120],
  [88, 1.05, 300],
  [22, 1.3, 90],
  [62, 1.4, -280],
  [92, 0.75, 60],
];

/** The end-of-game card: a spotlight and confetti for the winners, a dimmed screen for everyone else. */
export function EndCard({ view, onClose }: { view: GameView; onClose: () => void }) {
  const tone = endCardTone(view);
  const me = teamById(view, view.viewerTeamId);
  const line = me ? (tone === 'win' ? `${cardCount(me.timeline.length)} · well played` : `Your team: ${cardCount(me.timeline.length)}`) : null;
  return (
    <div className={`end-layer ${tone}`}>
      <div className="end-scrim" />
      {tone === 'win' ? (
        <>
          <div className="end-beam" />
          <div className="end-confetti" aria-hidden="true">
            {CONFETTI.map(([left, delay, r]) => (
              <i key={`${left}-${delay}`} style={{ left: `${left}%`, animationDelay: `${delay}s`, '--r': `${r}deg` } as CSSProperties} />
            ))}
          </div>
        </>
      ) : (
        <div className="end-dim" />
      )}
      <div className="end-card" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title">{winnersHeadline(view)}</h2>
        {line && <p className="muted">{line}</p>}
        <button type="button" className="btn" onClick={onClose}>
          See the timelines
        </button>
      </div>
    </div>
  );
}
