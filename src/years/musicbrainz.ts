export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface SearchBody {
  recordings?: { 'first-release-date'?: string }[];
}

export async function lookupEarliestYear(isrc: string, fetchFn: FetchLike): Promise<number | null> {
  const url = `https://musicbrainz.org/ws/2/recording?query=isrc:${encodeURIComponent(isrc)}&fmt=json&limit=25`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const body = (await res.json()) as SearchBody;
  const years = (body.recordings ?? [])
    .map((r) => Number.parseInt((r['first-release-date'] ?? '').slice(0, 4), 10))
    .filter((y) => Number.isFinite(y) && y > 1800);
  return years.length ? Math.min(...years) : null;
}
