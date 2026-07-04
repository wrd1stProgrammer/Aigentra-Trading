export type LiveRaceScoreInput = {
  readonly rank: number;
  readonly return24h: number;
  readonly hasLiveSide: boolean;
  readonly isPending: boolean;
  readonly isLossTone: boolean;
};

export type LiveRaceSortable = {
  readonly score: number;
  readonly return24h: number;
  readonly rank: number;
};

export function liveRaceScore({ rank, return24h, hasLiveSide, isPending, isLossTone }: LiveRaceScoreInput) {
  const exposureScore = hasLiveSide ? 28 : isPending ? 20 : isLossTone ? 18 : 0;
  const rankScore = Math.max(0, 10 - rank);
  const positiveReturnScore = Math.max(return24h, 0) * 10;
  const negativeReturnPenalty = return24h < 0 ? 36 + Math.abs(return24h) * 12 : 0;
  return positiveReturnScore + exposureScore + rankScore - negativeReturnPenalty;
}

export function compareLiveRaceItems(left: LiveRaceSortable, right: LiveRaceSortable) {
  return right.score - left.score || right.return24h - left.return24h || left.rank - right.rank;
}
