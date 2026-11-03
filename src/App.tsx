import { useCallback, useState } from 'react';
import { SAVE_KEY } from './host/session';
import { GuestApp } from './ui/GuestApp';
import { HostApp } from './ui/HostApp';
import { Home } from './ui/Home';
import { useRoute } from './ui/router';
import { Splash } from './ui/Splash';
import { type SplashMode, splashMode } from './ui/splashMode';
import { Tutorial, useTutorialRequests } from './ui/Tutorial';
import { markSeen, readSeen, shouldShowTutorial, type TutorialRole, tutorialFor } from './ui/tutorialContent';

function hasSavedGame(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const route = useRoute();
  const [splash, setSplash] = useState<SplashMode>(() =>
    splashMode({
      route,
      search: window.location.search,
      hasSavedGame: hasSavedGame(),
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    }),
  );
  const [tutorial, setTutorial] = useState<TutorialRole | null>(() => {
    const role = tutorialFor(route);
    const storage = safeStorage();
    const seen = storage ? readSeen(storage) : {};
    return shouldShowTutorial({ role, seen, splash }) ? role : null;
  });
  useTutorialRequests(setTutorial);
  const splashDone = useCallback(() => setSplash('none'), []);
  const markTutorialSeen = useCallback((role: TutorialRole) => {
    const storage = safeStorage();
    if (storage) markSeen(storage, role);
  }, []);
  const tutorialDone = useCallback(() => {
    if (tutorial) markTutorialSeen(tutorial);
    setTutorial(null);
  }, [tutorial, markTutorialSeen]);
  const tutorialSwitch = useCallback(
    (next: TutorialRole) => {
      if (tutorial) markTutorialSeen(tutorial);
      setTutorial(next);
    },
    [tutorial, markTutorialSeen],
  );
  return (
    <>
      {route.name === 'host' ? <HostApp /> : route.name === 'join' ? <GuestApp key={route.code} code={route.code} /> : <Home />}
      {splash === 'none' && tutorial && <Tutorial key={tutorial} role={tutorial} onClose={tutorialDone} onSwitch={tutorialSwitch} />}
      {splash !== 'none' && <Splash mode={splash} onDone={splashDone} />}
    </>
  );
}
