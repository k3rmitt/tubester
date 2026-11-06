import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Wordmark } from './components';
import { HOST_STEPS, PLAYER_STEPS, type StepArt, type TutorialRole } from './tutorialContent';

const OPEN_EVENT = 'tubester:tutorial';

/** Lets any screen reopen a tutorial ("How to play"). */
export function openTutorial(role: TutorialRole): void {
  window.dispatchEvent(new CustomEvent<TutorialRole>(OPEN_EVENT, { detail: role }));
}

export function useTutorialRequests(onOpen: (role: TutorialRole) => void): void {
  const cb = useRef(onOpen);
  cb.current = onOpen;
  useEffect(() => {
    const listener = (e: Event) => cb.current((e as CustomEvent<TutorialRole>).detail);
    window.addEventListener(OPEN_EVENT, listener);
    return () => window.removeEventListener(OPEN_EVENT, listener);
  }, []);
}

export function HowToPlay({ which }: { which: TutorialRole }) {
  return (
    <button type="button" className="link-btn" onClick={() => openTutorial(which)}>
      How to play
    </button>
  );
}

/** Renders **bold** markers from the step copy. */
function rich(text: string): ReactNode[] {
  // The copy is fixed text, so a part's position is a stable identity.
  return text.split('**').map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: static copy; parts never reorder
    i % 2 === 1 ? <b key={i}>{part}</b> : part,
  );
}

const Token = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" strokeWidth="2.5" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

function Art({ art }: { art: StepArt }) {
  switch (art) {
    case 'listen':
      return (
        <>
          <span className="cover mystery" style={{ width: 74, height: 74, fontSize: 40 }}>
            ?
          </span>
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="tut-mini">Mystery track</span>
        </>
      );
    case 'place':
      return (
        <>
          <span className="tut-slot">
            <i>+</i>Before 1984
          </span>
          <span className="tut-card">
            <b>1984</b>Purple Rain
          </span>
          <span className="tut-slot sel">
            <i>+</i>After 1984 · your guess
          </span>
        </>
      );
    case 'name':
      return (
        <>
          <span className="tut-row">
            <span className="tut-in">Title</span>
            <span className="tut-in">Artist</span>
          </span>
          <span className="tut-chip">
            <Token /> +1 token
          </span>
        </>
      );
    case 'steal':
      return (
        <>
          <span className="tut-slot steal">
            <i>+</i>Between 1977 and 2003
          </span>
          <span className="tut-tubester">TUBESTER!</span>
        </>
      );
    case 'tokens':
      return (
        <>
          <span className="tut-chip">
            <Token /> 2
          </span>
          <span className="tut-mini">
            Skip a song: 1 token
            <br />
            Buy a card: 3 tokens
          </span>
        </>
      );
    case 'win':
      return (
        <>
          <span className="tut-row center">
            <span className="tut-chip me">Cassette 10/10</span>
            <span className="tut-chip">Vinyl 7/10</span>
          </span>
          <span className="tut-big">You win!</span>
        </>
      );
    case 'computer':
      return (
        <>
          <svg width="96" height="72" viewBox="0 0 24 18" fill="none" stroke="#FFD23F" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="1.5" width="18" height="11.5" rx="1.5" />
            <path d="M1 16.5h22M9.5 7.2l4 2.3-4 2.3z" />
          </svg>
          <span className="tut-mini">Computer or phone</span>
        </>
      );
    case 'music':
      return (
        <>
          <span className="tut-row center">
            <span className="tut-chip me">Spotify</span>
            <span className="tut-chip">Demo tones</span>
          </span>
          <span className="tut-mini">Pick a playlist, then check the years</span>
        </>
      );
    case 'broadcast':
      return (
        <>
          <span className="tut-row center wrap">
            <span className="tut-chip me">In the room</span>
            <span className="tut-chip">On everyone's phone</span>
          </span>
          <span className="tut-mini">Pick where the music plays</span>
        </>
      );
    case 'invite':
      return (
        <>
          <span className="tut-link">…/#/join/TUBE-7K2Q</span>
          <span className="tut-mini">Up to 8 players · teams optional</span>
        </>
      );
    case 'referee':
      return (
        <span className="tut-row center wrap">
          <span className="tut-chip">Pause</span>
          <span className="tut-chip">Pass turn</span>
          <span className="tut-chip">Next</span>
          <span className="tut-chip">End game</span>
        </span>
      );
    case 'rules':
      return (
        <>
          <span className="tut-slot">
            <i>+</i>Before 1984
          </span>
          <span className="tut-tubester small">TUBESTER!</span>
        </>
      );
  }
}

/** Step-by-step rules (player) or setup (host). Skip is always available. */
export function Tutorial({
  role,
  onClose,
  onSwitch,
}: {
  role: TutorialRole;
  onClose: () => void;
  onSwitch: (role: TutorialRole) => void;
}) {
  const steps = role === 'host' ? HOST_STEPS : PLAYER_STEPS;
  const [index, setIndex] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus Next whenever the step or tutorial changes
  useEffect(() => {
    next.current?.focus();
  }, [index, role]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <div className={`tutorial ${role}`} role="dialog" aria-modal="true" aria-labelledby="tut-title">
      <div className="tut-box">
        <header className="tut-top">
          <span className="tut-brand">
            <Wordmark /> · {role === 'host' ? 'Hosting a game' : 'How to play'}
          </span>
          <button type="button" className="tut-skip" onClick={onClose}>
            Skip tutorial
          </button>
        </header>
        <div className="tut-step" key={`${role}-${index}`}>
          <div className="tut-art" aria-hidden="true">
            <Art art={step.art} />
          </div>
          <div className="tut-text">
            <span className="kicker">{step.kicker}</span>
            <h2 id="tut-title">{step.title}</h2>
            <p>{rich(step.body)}</p>
            {role === 'host' && last && (
              <button type="button" className="link-btn" onClick={() => onSwitch('player')}>
                See the players' tutorial
              </button>
            )}
          </div>
        </div>
        <footer className="tut-foot">
          <span className="tut-dots" role="img" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <i key={s.kicker} className={i === index ? 'on' : ''} />
            ))}
          </span>
          <span className="tut-nav">
            {index > 0 && (
              <button type="button" className="btn small" onClick={() => setIndex(index - 1)}>
                Back
              </button>
            )}
            <button ref={next} type="button" className="btn primary small" onClick={() => (last ? onClose() : setIndex(index + 1))}>
              {last ? "Let's play" : 'Next'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
