export interface Guess {
  title: string;
  artist: string;
}

export function normalize(input: string): string {
  let x = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  x = x.replace(/[([][^)\]]*[)\]]/g, ' '); // (feat. …), [Live], (Remastered)
  x = x.replace(/\s+-\s+.*$/, ' '); // " - Remastered 2011", " - Live"
  x = x.replace(/\b(feat|ft|featuring)\b.*$/, ' ');
  x = x.replace(/&/g, ' and ');
  x = x.replace(/['’]/g, '');
  x = x.replace(/[^a-z0-9]+/g, ' ');
  x = x.replace(/\bn\b/g, 'and'); // guns n roses → guns and roses
  x = x.trim().replace(/\s+/g, ' ');
  x = x.replace(/^the /, '');
  return x;
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similar(a: string, b: string, threshold = 0.8): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= threshold;
}

export function matchesGuess(guess: Guess, track: { title: string; artists: string[] }): boolean {
  const title = normalize(guess.title);
  const artist = normalize(guess.artist);
  if (!title || !artist) return false;
  return similar(title, normalize(track.title)) && track.artists.some((a) => similar(artist, normalize(a)));
}
