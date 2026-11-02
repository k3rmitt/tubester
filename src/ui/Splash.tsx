import { useEffect } from 'react';
import { SPLASH_MS, type SplashMode } from './splashMode';

/** Animated welcome: TUBE and STER spiral into a spinning record, then the logo pops. A tap skips it. */
export function Splash({ mode, onDone }: { mode: Exclude<SplashMode, 'none'>; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, SPLASH_MS[mode]);
    return () => clearTimeout(id);
  }, [mode, onDone]);
  return (
    <div className={`splash ${mode}`} onPointerDown={onDone} role="presentation">
      <div className="splash-stage" aria-hidden="true">
        <div className="splash-record" />
        <span className="splash-word tube">TUBE</span>
        <span className="splash-word ster">STER</span>
        <div className="splash-label" />
        <span className="splash-mark">
          <svg viewBox="0 0 248 72" width="248" height="72" aria-hidden="true">
            <rect x="1" y="1" width="246" height="70" rx="12" pathLength="1" />
          </svg>
          TUBE<em>STER</em>
        </span>
      </div>
      <p className="splash-tagline">You know, You knew it</p>
    </div>
  );
}
