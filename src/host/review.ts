import type { ResolvedTrack } from '../years/resolve';
import type { GameTrack } from './session';

export interface ReviewRow extends ResolvedTrack {
  include: boolean;
  chosenYear: number;
}

export function toReviewRows(resolved: ResolvedTrack[]): ReviewRow[] {
  return resolved.map((t) => ({ ...t, include: true, chosenYear: t.year }));
}

export function setYear(
  rows: ReviewRow[],
  id: string,
  year: number,
  maxYear: number = new Date().getFullYear(),
): ReviewRow[] {
  if (!Number.isInteger(year) || year < 1900 || year > maxYear) return rows;
  return rows.map((r) => (r.id === id ? { ...r, chosenYear: year } : r));
}

export function setInclude(rows: ReviewRow[], id: string, include: boolean): ReviewRow[] {
  return rows.map((r) => (r.id === id ? { ...r, include } : r));
}

export function reviewSummary(rows: ReviewRow[]): { total: number; toCheck: number; included: number } {
  return {
    total: rows.length,
    toCheck: rows.filter((r) => r.flag !== 'ok').length,
    included: rows.filter((r) => r.include).length,
  };
}

export function gameTracks(rows: ReviewRow[]): GameTrack[] {
  return rows
    .filter((r) => r.include)
    .map((r) => ({ id: r.id, title: r.title, artists: [...r.artists], isrc: r.isrc, sourceYear: r.sourceYear, year: r.chosenYear }));
}
