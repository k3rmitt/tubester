/** The picked slots nobody has taken yet: the active team's pick and other steals drop out. */
export function stillFree(picked: ReadonlySet<number>, turn: { slot: number | null; steals: { slot: number }[] }): number[] {
  return [...picked].filter((i) => i !== turn.slot && !turn.steals.some((s) => s.slot === i));
}
