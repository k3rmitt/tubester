import type { GameView, TeamView } from '../host/view';

export function slotLabel(cards: { year: number }[], slot: number): string {
  if (cards.length === 0) return 'Anywhere';
  if (slot <= 0) return `Before ${cards[0].year}`;
  if (slot >= cards.length) return `After ${cards[cards.length - 1].year}`;
  return `Between ${cards[slot - 1].year} and ${cards[slot].year}`;
}

export function teamById(view: GameView, id: string | null | undefined): TeamView | undefined {
  return view.teams.find((t) => t.id === id);
}

export function revealHeadline(view: GameView): string {
  const outcome = view.reveal?.outcome;
  if (!outcome) return '';
  if (outcome.cardWonBy === null) return 'Nobody got it';
  const stolen = outcome.cardWonBy !== outcome.activeTeamId;
  if (outcome.cardWonBy === view.viewerTeamId) return stolen ? 'You stole it!' : 'You got it!';
  const name = teamById(view, outcome.cardWonBy)?.name ?? 'Someone';
  return stolen ? `${name} stole it` : `${name} got it`;
}

export function winnersHeadline(view: GameView): string {
  if (view.phase !== 'finished') return '';
  if (view.viewerTeamId && view.winnerIds.includes(view.viewerTeamId)) return 'You win!';
  const names = view.winnerIds.map((id) => teamById(view, id)?.name ?? id);
  return `${names.join(' & ')} ${names.length === 1 ? 'wins' : 'win'}!`;
}
