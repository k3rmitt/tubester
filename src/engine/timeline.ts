import type { Card } from './types';

export function isValidSlot(timeline: Card[], slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot <= timeline.length;
}

export function isCorrectSlot(timeline: Card[], slot: number, year: number): boolean {
  if (!isValidSlot(timeline, slot)) return false;
  const left = slot > 0 ? timeline[slot - 1].year : -Infinity;
  const right = slot < timeline.length ? timeline[slot].year : Infinity;
  return left <= year && year <= right;
}

export function insertCard(timeline: Card[], card: Card): Card[] {
  const i = timeline.findIndex((c) => c.year > card.year);
  const at = i === -1 ? timeline.length : i;
  return [...timeline.slice(0, at), card, ...timeline.slice(at)];
}
