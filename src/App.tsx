import { useCallback, useState } from 'react';
import { SAVE_KEY } from './host/session';
import { GuestApp } from './ui/GuestApp';
import { HostApp } from './ui/HostApp';
import { Home } from './ui/Home';
import { useRoute } from './ui/router';
import { Splash } from './ui/Splash';
import { type SplashMode, splashMode } from './ui/splashMode';

function hasSavedGame(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
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
  const done = useCallback(() => setSplash('none'), []);
  return (
    <>
      {route.name === 'host' ? <HostApp /> : route.name === 'join' ? <GuestApp key={route.code} code={route.code} /> : <Home />}
      {splash !== 'none' && <Splash mode={splash} onDone={done} />}
    </>
  );
}
