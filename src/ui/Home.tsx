import { HowToPlay } from './Tutorial';
import { type FormEvent, useState } from 'react';
import { Disc, Wordmark } from './components';
import { NAME_KEY } from './keys';

export function Home() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  function create(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    localStorage.setItem(NAME_KEY, n);
    window.location.hash = '#/host';
  }
  return (
    <main className="screen">
      <form className="rows" onSubmit={create}>
        <div className="hero">
          <Disc size={112} />
          <Wordmark big />
          <p className="muted">A music timeline party game. Host on this computer, friends join from their phones.</p>
        </div>
        <label className="field">
          Your name
          <input
            className="input"
            value={name}
            maxLength={24}
            required
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn primary">
          Create room
        </button>
        <p className="muted">Demo mode plays test tones instead of real songs. Spotify comes next.</p>
        <HowToPlay which="host" />
      </form>
    </main>
  );
}
