import type { KeyValueStorage } from '../util/storage';
import type { Route } from './router';
import type { SplashMode } from './splashMode';

export type TutorialRole = 'host' | 'player';
export type Seen = Partial<Record<TutorialRole, true>>;

export const TUTORIAL_KEY = 'tubester.tutorial';

/** Invite links teach the player rules; the home page and hosting teach the host setup. */
export function tutorialFor(route: Route): TutorialRole {
  return route.name === 'join' ? 'player' : 'host';
}

/** Once per role on this device, and only right after a splash. */
export function shouldShowTutorial(input: { role: TutorialRole; seen: Seen; splash: SplashMode }): boolean {
  return input.splash !== 'none' && !input.seen[input.role];
}

export function readSeen(storage: KeyValueStorage): Seen {
  try {
    const raw = storage.getItem(TUTORIAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const seen: Seen = {};
    if (parsed.host === true) seen.host = true;
    if (parsed.player === true) seen.player = true;
    return seen;
  } catch {
    return {};
  }
}

export function markSeen(storage: KeyValueStorage, role: TutorialRole): void {
  try {
    storage.setItem(TUTORIAL_KEY, JSON.stringify({ ...readSeen(storage), [role]: true }));
  } catch {
    // Storage blocked: the tutorial may show again next time, which is fine.
  }
}

export type StepArt =
  | 'listen'
  | 'place'
  | 'name'
  | 'steal'
  | 'tokens'
  | 'win'
  | 'computer'
  | 'music'
  | 'broadcast'
  | 'invite'
  | 'referee'
  | 'rules';

export interface TutorialStep {
  art: StepArt;
  kicker: string;
  title: string;
  /** Plain text; **double stars** mark words shown in bold. */
  body: string;
}

export const PLAYER_STEPS: TutorialStep[] = [
  {
    art: 'listen',
    kicker: '1 · Listen',
    title: 'A song plays on your phone',
    body: 'Nobody sees the title or the year. Turn your sound on and listen.',
  },
  {
    art: 'place',
    kicker: '2 · Place it',
    title: 'Your turn: when was it released?',
    body: 'Tap a **yellow spot** on your timeline (before, between or after your cards), then **Lock in**. Right year range = you keep the card.',
  },
  {
    art: 'name',
    kicker: '3 · Name it',
    title: 'Know the song? Earn a token',
    body: 'Type the **title and the artist** before locking in. Both right = **+1 token**, even if the year is wrong.',
  },
  {
    art: 'steal',
    kicker: '4 · Steal',
    title: "Think they're wrong? TUBESTER!",
    body: 'When another team locks in, pick the spot you think is right (**1 token each**), and/or name the song, then press **TUBESTER!** Nothing to offer? Press it to pass. If they are wrong and you are right, the card is yours.',
  },
  {
    art: 'tokens',
    kicker: '5 · Tokens',
    title: 'Spend your tokens wisely',
    body: 'Tokens let you **steal**, **skip** a song you don\'t like on your turn (1 token), or **buy** a card that goes straight onto your timeline (3 tokens).',
  },
  {
    art: 'win',
    kicker: '6 · Win',
    title: 'First to the target wins',
    body: 'The first team to reach the target (**10 cards** by default) wins. Your starting card counts. Anyone can **Pause** the game at any time. Ready?',
  },
];

export const HOST_STEPS: TutorialStep[] = [
  {
    art: 'computer',
    kicker: '1 · Your computer is the stage',
    title: 'Host on this computer',
    body: "Use **Chrome or Edge** on a computer. The music plays here and is streamed to everyone's phone. You play too, with your own team.",
  },
  {
    art: 'music',
    kicker: '2 · Music',
    title: 'Pick your playlist',
    body: "Log in with **Spotify Premium** and choose one of your playlists. TUBESTER finds each song's original year; check the ones flagged before starting. No Spotify? **Demo tones** let you try the game.",
  },
  {
    art: 'broadcast',
    kicker: '3 · Broadcast',
    title: "Share this tab's sound",
    body: 'Press **Start broadcast**, choose **this tab** and keep **Also share tab audio** on. That is how the music reaches the phones.',
  },
  {
    art: 'invite',
    kicker: '4 · Invite',
    title: 'Send the link',
    body: 'Share the invite link or room code. Players join from their phones, no account needed. Everyone plays solo, or put people on the same team. Set the cards to win and the steal time, then **Start game**.',
  },
  {
    art: 'referee',
    kicker: '5 · Run the game',
    title: "You're the referee",
    body: 'Each turn a song plays, the team places it, the others can steal, then the answer is revealed. **Pause** any time, **Pass turn** if a team is stuck, and from the pause screen you can **End game**.',
  },
  {
    art: 'rules',
    kicker: '6 · The rules',
    title: 'How players play',
    body: "Place the song on your timeline, name it for a token, steal with **TUBESTER!** First team to the target wins. See the players' tutorial for the full rules.",
  },
];
