// What every game and drill emits when a run ends. `stats` is stored with the
// score; `stats.summary` (one short line) is shown in the run history.
export interface GameResult {
  score: number;
  stats: { summary: string; [k: string]: unknown };
}
